import { embedTexts } from './embed'
import { getOpenAIClient, LLM_MODEL, estimateLLMCents } from './client'
import { friendlyCountry } from './locale'
import { checkBudget, incrementSpend } from './budget'

// Foreign-currency / overseas-spend detection. Built from the runtime's
// own ISO 4217 list (~180 codes) — no hand-maintained allowlist that drifts
// when ISO adds a new code. Detection is purely lexical against the
// transaction description: no AI call needed.
//
// We exclude the user's home currency so domestic statements don't trigger,
// and we exclude a few high-false-positive codes that overlap with English
// words (like "ALL" the Albanian lek) when they appear in a description
// without amount context.
const HIGH_FALSE_POSITIVE_CODES = new Set(['ALL'])
const ALL_ISO_4217: ReadonlySet<string> = (() => {
  try {
    // @ts-ignore - supportedValuesOf is available on Node 18+
    const list = (Intl as any).supportedValuesOf?.('currency') as string[] | undefined
    if (!list) return new Set<string>()
    return new Set(list.map(c => c.toUpperCase()).filter(c => !HIGH_FALSE_POSITIVE_CODES.has(c)))
  } catch {
    return new Set<string>()
  }
})()

// Spelled-out names that commonly appear on statement lines instead of (or
// alongside) the ISO code. Currency-like words are short so the false-positive
// risk is low; we still exclude any that match the home currency's name.
const SPELLED_OUT_BY_CODE: Record<string, string[]> = {
  JPY: ['YEN'],
  KRW: ['WON'],
  EUR: ['EURO'],
  GBP: ['POUND', 'STERLING'],
  CNY: ['YUAN', 'RMB'],
}

export function detectIsTravel(description: string, homeCurrency: string | null): boolean {
  if (!description) return false
  const upper = description.toUpperCase()
  const home = (homeCurrency ?? '').toUpperCase()

  // Tokenize on non-letter so we get whole-word matching without per-token regex.
  const tokens = new Set(upper.split(/[^A-Z]+/).filter(Boolean))

  for (const token of tokens) {
    if (token === home) continue
    if (ALL_ISO_4217.has(token)) return true
  }

  // Spelled-out fallback. Only trigger if the corresponding ISO code isn't
  // the home currency (so a JP user's "YEN" rows don't flag as travel).
  for (const [code, names] of Object.entries(SPELLED_OUT_BY_CODE)) {
    if (code === home) continue
    if (names.some(n => tokens.has(n))) return true
  }

  return false
}

/**
 * Auto-apply pipeline: free signals first (KNN over tagged history,
 * tag-embed against category embeddings), LLM fallback for cold rows.
 *
 * Designed to run during ingest (against `transaction_imports` rows) so
 * the user sees a pre-categorized review screen. Confirm becomes a clean
 * promote — no more LLM/embedding work at confirm time.
 *
 * **Categories only.** Labels are user-driven; this module never touches
 * them.
 */

const KNN_STRONG_SIMILARITY = 0.7
const KNN_MIN_VOTES_FOR_AUTO = 2
const TAG_EMBED_STRONG_SIMILARITY = 0.4
const KNN_LIMIT = 20
const TAG_EMBED_LIMIT = 10

// Category names AI must not auto-apply. The user can still pick these
// manually from the dropdown — we only block them as auto outputs.
//   "other" — polite "I don't know" guess; identical to uncategorized.
//   "travel" — superseded by the is_travel flag on the transaction.
//     We keep the category around so users with existing travel rows
//     can still see/edit them, but new AI categorizations should never
//     pick it; the flag is the canonical way to mark travel spend.
//   "flights" / "hotels-stays" / "tours-activities" / "rental-car" —
//     subs of the deprecated travel branch; same rationale.
// Comparison is case-insensitive and exact-match.
const AI_FORBIDDEN_CATEGORY_NAMES: ReadonlySet<string> = new Set([
  'other',
  'travel',
  'flights',
  'hotels-stays',
  'tours-activities',
  'rental-car',
])

function isAiPickable(name: string): boolean {
  return !AI_FORBIDDEN_CATEGORY_NAMES.has(name.trim().toLowerCase())
}

interface AutoApplyResult {
  categoryId: string
  signal: 'knn' | 'tag-embed' | 'llm'
  similarity: number
}

interface ImportRow {
  id: string
  description: string
  user_id: string
}

/**
 * Sync, free-signal pass over a batch of staging imports. For each row:
 *   1. Embed (one batched OpenAI call).
 *   2. KNN over tagged transactions (vote-based).
 *   3. tag-embed against category embeddings (semantic match).
 *   4. Take the strongest signal that crosses threshold; write category_id +
 *      category_source='ai' on the import row.
 *
 * Rows with no signal stay uncategorized. The caller fires
 * `llmFallbackForUncategorizedImports` in the background to fill those in
 * while the user is on the review screen.
 */
export async function autoApplyCategoriesBatch(
  supabase: any,
  userId: string,
  importIds: string[],
): Promise<{ categorized: number; flaggedAsTravel: number }> {
  if (importIds.length === 0) return { categorized: 0, flaggedAsTravel: 0 }

  try {
    const { data, error } = await supabase
      .from('transaction_imports')
      .select('id, description')
      .in('id', importIds)
    if (error || !data) return { categorized: 0, flaggedAsTravel: 0 }
    const rows = (data as { id: string; description: string }[])
      .filter(r => r.description && r.description.length > 0)
    if (rows.length === 0) return { categorized: 0, flaggedAsTravel: 0 }

    // 0. Resolve home currency once for the foreign-token filter.
    const { data: settings } = await supabase
      .from('user_settings')
      .select('currency')
      .eq('user_id', userId)
      .maybeSingle()
    const homeCurrency = ((settings as { currency?: string } | null)?.currency ?? '').toUpperCase() || null

    // 1. Detect is_travel from the description before any AI work — purely
    // lexical, deterministic, free.
    const travelFlags = new Map<string, boolean>(
      rows.map(r => [r.id, detectIsTravel(r.description, homeCurrency)]),
    )
    const travelRows = rows.filter(r => travelFlags.get(r.id))
    if (travelRows.length > 0) {
      await Promise.all(
        travelRows.map(r =>
          supabase
            .from('transaction_imports')
            .update({ is_travel: true })
            .eq('id', r.id),
        ),
      )
    }

    // 2. Embed all descriptions in one OpenAI call. Persist on the import row
    // so the suggestion path doesn't need to re-embed.
    const embedResult = await embedTexts(rows.map(r => r.description))
    if (!embedResult || embedResult.embeddings.length !== rows.length) {
      return { categorized: 0, flaggedAsTravel: travelRows.length }
    }

    // Persist embeddings (parallel updates).
    await Promise.all(
      rows.map((row, i) =>
        supabase
          .from('transaction_imports')
          .update({ description_embedding: embedResult.embeddings[i] as any })
          .eq('id', row.id),
      ),
    )

    // 3. Resolve which categories AI must not auto-apply (e.g. "Other" —
    // a polite-empty answer that's identical to leaving the row uncategorized).
    const { data: catsForBlocklist } = await supabase
      .from('tags')
      .select('id, name')
      .eq('user_id', userId)
      .eq('kind', 'category')
    const blockedCategoryIds = new Set(
      ((catsForBlocklist ?? []) as { id: string; name: string }[])
        .filter(c => !isAiPickable(c.name))
        .map(c => c.id),
    )

    // 4. For each row, run KNN + tag-embed in parallel, decide.
    const decisions: { id: string; categoryId: string }[] = []
    await Promise.all(
      rows.map(async (row, i) => {
        const embedding = embedResult.embeddings[i]
        const decision = await decideCategoryForEmbedding(
          supabase, userId, row.id, embedding, blockedCategoryIds,
        )
        if (decision) {
          decisions.push({ id: row.id, categoryId: decision.categoryId })
        }
      }),
    )

    if (decisions.length === 0) {
      return { categorized: 0, flaggedAsTravel: travelRows.length }
    }

    // 4. Apply decisions in parallel.
    await Promise.all(
      decisions.map(d =>
        supabase
          .from('transaction_imports')
          .update({ category_id: d.categoryId, category_source: 'ai' })
          .eq('id', d.id),
      ),
    )
    return { categorized: decisions.length, flaggedAsTravel: travelRows.length }
  } catch (err) {
    console.warn('autoApplyCategoriesBatch failed', err)
    return { categorized: 0, flaggedAsTravel: 0 }
  }
}

/**
 * Free-signals decision for a single embedding. Returns the best candidate
 * crossing threshold or null. Used by the batch path above; exposed for
 * testing and the on-demand suggestion path on /transactions if we ever
 * wire it.
 */
export async function decideCategoryForEmbedding(
  supabase: any,
  userId: string,
  excludeId: string | null,
  embedding: number[],
  blockedCategoryIds: ReadonlySet<string> = new Set(),
): Promise<AutoApplyResult | null> {
  const [knnResultRaw, tagEmbedResultRaw] = await Promise.all([
    knnVote(supabase, userId, excludeId, embedding),
    knnNearestCategories(supabase, userId, embedding),
  ])

  const knnResult = knnResultRaw.filter(v => !blockedCategoryIds.has(v.categoryId))
  const tagEmbedResult = tagEmbedResultRaw.filter(c => !blockedCategoryIds.has(c.id))

  // KNN-strong: ≥ KNN_MIN_VOTES_FOR_AUTO neighbours agreeing on a category, all ≥ KNN_STRONG_SIMILARITY.
  if (knnResult.length > 0) {
    const top = knnResult[0]
    if (top.votes >= KNN_MIN_VOTES_FOR_AUTO && top.topSim >= KNN_STRONG_SIMILARITY) {
      const collapsed = await collapseToChildIfPresent(supabase, userId, knnResult, top)
      return { categoryId: collapsed, signal: 'knn', similarity: top.topSim }
    }
  }

  if (tagEmbedResult.length > 0) {
    const top = tagEmbedResult[0]
    if (top.similarity >= TAG_EMBED_STRONG_SIMILARITY) {
      return { categoryId: top.id, signal: 'tag-embed', similarity: top.similarity }
    }
  }

  return null
}

interface KNNVote {
  categoryId: string
  votes: number
  topSim: number
}

async function knnVote(
  supabase: any,
  userId: string,
  excludeId: string | null,
  embedding: number[],
): Promise<KNNVote[]> {
  const { data, error } = await supabase.rpc('knn_neighbour_categories_for_imports', {
    p_user_id: userId,
    p_exclude_id: excludeId,
    p_embedding: embedding as unknown as string,
    p_limit: KNN_LIMIT,
  })
  if (error || !data) return []

  const tally = new Map<string, { votes: number; topSim: number }>()
  for (const row of data as { category_id: string; similarity: number }[]) {
    if (!row.category_id) continue
    if (row.similarity < KNN_STRONG_SIMILARITY) continue
    const existing = tally.get(row.category_id)
    if (!existing) {
      tally.set(row.category_id, { votes: 1, topSim: row.similarity })
    } else {
      existing.votes += 1
      existing.topSim = Math.max(existing.topSim, row.similarity)
    }
  }
  return Array.from(tally.entries())
    .map(([categoryId, v]) => ({ categoryId, votes: v.votes, topSim: v.topSim }))
    .sort((a, b) => b.votes - a.votes || b.topSim - a.topSim)
}

interface NearestCategory {
  id: string
  name: string
  parent_id: string | null
  similarity: number
}

async function knnNearestCategories(
  supabase: any,
  userId: string,
  embedding: number[],
): Promise<NearestCategory[]> {
  const { data, error } = await supabase.rpc('knn_nearest_categories', {
    p_user_id: userId,
    p_embedding: embedding as unknown as string,
    p_limit: TAG_EMBED_LIMIT,
  })
  if (error || !data) return []
  return data as NearestCategory[]
}

/**
 * If KNN's top vote is a parent and one of its children is also among the
 * candidates, prefer the child. Mirrors the existing collapseHierarchy
 * principle: most-specific wins.
 */
async function collapseToChildIfPresent(
  supabase: any,
  userId: string,
  votes: KNNVote[],
  top: KNNVote,
): Promise<string> {
  const candidateIds = votes.map(v => v.categoryId)
  if (candidateIds.length === 0) return top.categoryId
  const { data } = await supabase
    .from('tags')
    .select('id, parent_id')
    .eq('user_id', userId)
    .in('id', candidateIds)
  if (!data) return top.categoryId

  const child = (data as { id: string; parent_id: string | null }[])
    .find(t => t.parent_id === top.categoryId)
  return child ? child.id : top.categoryId
}

// ---------- LLM fallback (batched) ----------

const LLM_TOOL = 'record_categorizations'
const LLM_BATCH_SIZE = 50

const LLM_TOOL_PARAMETERS = {
  type: 'object' as const,
  properties: {
    categorizations: {
      type: 'array' as const,
      description: 'One result per input transaction. Empty categoryId if no category fits.',
      items: {
        type: 'object' as const,
        properties: {
          transactionId: { type: 'string' as const },
          categoryId: { type: 'string' as const, description: 'A category id from the taxonomy, or empty string.' },
        },
        required: ['transactionId', 'categoryId'],
      },
    },
  },
  required: ['categorizations'],
}

interface CategoryNode {
  id: string
  name: string
  parent_id: string | null
}

interface BatchInput {
  id: string
  description: string
  amount: number
  date: string
}

/**
 * One LLM round-trip per chunk of `LLM_BATCH_SIZE` rows. Far cheaper +
 * faster than per-row calls (single shared system prompt, single network
 * roundtrip). Returns a map of transactionId → categoryId for rows the
 * model could place. Skips invalid IDs the model might hallucinate.
 *
 * Budget rechecked between batches so we stop the moment the cap is hit.
 */
async function llmBatchCategorize(args: {
  client: any
  country: string
  homeCurrency: string | null
  rows: BatchInput[]
  categories: CategoryNode[]
  userId: string
}): Promise<{ assignments: Map<string, string>; budgetExhausted: boolean }> {
  const { client, country, homeCurrency, rows, userId } = args
  // Hide AI-forbidden categories ("Other") from the LLM entirely. The model
  // genuinely doesn't know they exist, so "doesn't fit anywhere" stays
  // empty-string and the row stays uncategorized — exactly what we want.
  const categories = args.categories.filter(c => isAiPickable(c.name))
  const validIds = new Set(categories.map(c => c.id))
  const assignments = new Map<string, string>()
  let budgetExhausted = false

  const homeNote = homeCurrency ? ` Their home currency is ${homeCurrency}.` : ''
  const systemPrompt = `You categorise bank transactions for a user in ${country}.${homeNote}

Pick one category id from this taxonomy for each input transaction (you MUST pick from these IDs only):
${renderCategoryVocabulary(categories)}

The category answers "what kind of spend is this?" — geography is irrelevant.
A train ride in Tokyo is still Transport. A supermarket in Hokkaido is still
Food/Groceries. An electronics store in Osaka is still Shopping/Electronics.
Travel spending is a separate flag handled elsewhere — do NOT use the Travel
category for general spend that happens during travel.

Use the **Travel** category (or its subs) ONLY for travel-specific items:
- Airlines, flights, airline tickets → travel/flights
- Hotels, ryokan, hostels, AirBnB, B&B → travel/hotels-stays
- Tour operators, theme park tickets, guided tours, sightseeing → travel/tours-activities
- Travel agencies (Expedia, Klook, Booking.com, Agoda) → travel or its closest sub

For everything else, pick by what the merchant sells / does, regardless of where:
- Convenience stores (Lawson, 7-Eleven, FamilyMart) → food (groceries or closest)
- Restaurants, cafes, fast food → food/dining or food (closest)
- Trains, subways, buses, transit cards → transport/public-transit
- Taxis, ride-hailing apps → transport/ride-hailing or transport/taxi
- Department stores, malls, electronics retailers (Yodobashi, Don Quijote, Aeon Mall, Bookoff) → shopping or its closest sub
- Zoos, museums, attractions, theme parks → entertainment/attractions
- Pharmacies, drugstores → health/pharmacy
- Gas stations → transport/fuel

Rules:
1. Prefer the most specific category — child over parent — when a sub fits.
2. If no sub fits but the parent does, return the parent id.
3. Never invent IDs. Never return a category from a different parent because the merchant is foreign.
4. Return an empty string for a transaction ONLY if nothing in this taxonomy fits at all.
5. Return one entry per input transactionId. Do not skip any.`

  for (let i = 0; i < rows.length; i += LLM_BATCH_SIZE) {
    const budget = await checkBudget(userId)
    if (!budget.allowed) {
      budgetExhausted = true
      break
    }
    const batch = rows.slice(i, i + LLM_BATCH_SIZE)
    const validBatchIds = new Set(batch.map(b => b.id))

    const userMessage = `Categorise these transactions. Return one categorizations entry per input.
\`\`\`json
${JSON.stringify(batch.map(r => ({ id: r.id, description: r.description, amount: r.amount, date: r.date })))}
\`\`\``

    let response
    try {
      response = await client.chat.completions.create({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: LLM_TOOL,
              description: 'Record one category id per transaction.',
              parameters: LLM_TOOL_PARAMETERS,
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: LLM_TOOL } },
      })
    } catch (err) {
      console.warn('Batch LLM call failed', err)
      continue
    }

    const usage = response.usage
    const cents = estimateLLMCents({
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    })
    if (cents > 0) await incrementSpend(userId, cents)

    const toolCall = response.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall || toolCall.type !== 'function') continue
    let parsed: { categorizations?: { transactionId: string; categoryId: string }[] }
    try {
      parsed = JSON.parse(toolCall.function.arguments)
    } catch {
      continue
    }

    for (const cat of parsed.categorizations ?? []) {
      if (!cat || typeof cat.transactionId !== 'string') continue
      if (!validBatchIds.has(cat.transactionId)) continue
      const trimmed = (cat.categoryId ?? '').trim()
      if (!trimmed) continue
      if (!validIds.has(trimmed)) continue
      assignments.set(cat.transactionId, trimmed)
    }
  }

  return { assignments, budgetExhausted }
}

/**
 * LLM categorization for staging rows still missing a category after the
 * free-signal pass. One LLM round-trip per `LLM_BATCH_SIZE` rows.
 * Budgeted via `user_settings.ai_monthly_budget_cents`; degrades silently
 * to "stay uncategorized" when budget is hit.
 */
export async function llmFallbackForUncategorizedImports(
  supabase: any,
  userId: string,
  statementId: string,
  options: { onlyImportIds?: string[] } = {},
): Promise<{ categorized: number; attempted: number; budgetExhausted: boolean }> {
  try {
    const client = getOpenAIClient()
    if (!client) return { categorized: 0, attempted: 0, budgetExhausted: false }

    let rowQuery = supabase
      .from('transaction_imports')
      .select('id, description, amount, date')
      .eq('statement_id', statementId)
      .is('category_id', null)
    if (options.onlyImportIds && options.onlyImportIds.length > 0) {
      rowQuery = rowQuery.in('id', options.onlyImportIds)
    }
    const { data: rowsData } = await rowQuery
    const rows = (rowsData ?? []) as BatchInput[]
    if (rows.length === 0) return { categorized: 0, attempted: 0, budgetExhausted: false }

    const { data: catsData } = await supabase
      .from('tags')
      .select('id, name, parent_id')
      .eq('user_id', userId)
      .eq('kind', 'category')
    const categories = (catsData ?? []) as CategoryNode[]
    if (categories.length === 0) return { categorized: 0, attempted: 0, budgetExhausted: false }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('country, currency')
      .eq('user_id', userId)
      .maybeSingle()
    const settingsRow = settings as { country?: string; currency?: string } | null
    const country = friendlyCountry(settingsRow?.country ?? null)
    const homeCurrency = (settingsRow?.currency ?? '').toUpperCase() || null

    const { assignments, budgetExhausted } = await llmBatchCategorize({
      client, country, homeCurrency, rows, categories, userId,
    })

    if (assignments.size > 0) {
      await Promise.all(
        Array.from(assignments.entries()).map(([id, categoryId]) =>
          supabase
            .from('transaction_imports')
            .update({ category_id: categoryId, category_source: 'ai' })
            .eq('id', id),
        ),
      )
    }
    return { categorized: assignments.size, attempted: rows.length, budgetExhausted }
  } catch (err) {
    console.warn('llmFallbackForUncategorizedImports failed', err)
    return { categorized: 0, attempted: 0, budgetExhausted: false }
  }
}

/**
 * Re-runs LLM categorization against `transactions` rows where category_id
 * IS NULL. Useful after a model / prompt upgrade — existing data was
 * categorized with the old setup and won't reflect the change otherwise.
 *
 * Same budget gate as the staging fallback. Same parallelism (5 in flight).
 * Picks from the user's full category vocabulary.
 */
export async function recategorizeUncategorizedTransactions(
  supabase: any,
  userId: string,
): Promise<{ categorized: number; attempted: number; budgetExhausted: boolean }> {
  try {
    const client = getOpenAIClient()
    if (!client) return { categorized: 0, attempted: 0, budgetExhausted: false }

    const { data: rowsData } = await supabase
      .from('transactions')
      .select('id, description, amount, date')
      .eq('user_id', userId)
      .is('category_id', null)
      .eq('status', 'active')
    const rows = (rowsData ?? []) as BatchInput[]
    if (rows.length === 0) return { categorized: 0, attempted: 0, budgetExhausted: false }

    const { data: catsData } = await supabase
      .from('tags')
      .select('id, name, parent_id')
      .eq('user_id', userId)
      .eq('kind', 'category')
    const categories = (catsData ?? []) as CategoryNode[]
    if (categories.length === 0) return { categorized: 0, attempted: 0, budgetExhausted: false }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('country, currency')
      .eq('user_id', userId)
      .maybeSingle()
    const settingsRow = settings as { country?: string; currency?: string } | null
    const country = friendlyCountry(settingsRow?.country ?? null)
    const homeCurrency = (settingsRow?.currency ?? '').toUpperCase() || null

    const { assignments, budgetExhausted } = await llmBatchCategorize({
      client, country, homeCurrency, rows, categories, userId,
    })

    if (assignments.size > 0) {
      await Promise.all(
        Array.from(assignments.entries()).map(([id, categoryId]) =>
          supabase
            .from('transactions')
            .update({ category_id: categoryId, category_source: 'ai' })
            .eq('id', id),
        ),
      )
    }
    return { categorized: assignments.size, attempted: rows.length, budgetExhausted }
  } catch (err) {
    console.warn('recategorizeUncategorizedTransactions failed', err)
    return { categorized: 0, attempted: 0, budgetExhausted: false }
  }
}

function renderCategoryVocabulary(categories: CategoryNode[]): string {
  const byParent = new Map<string | null, CategoryNode[]>()
  for (const cat of categories) {
    const p = cat.parent_id ?? null
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p)!.push(cat)
  }
  const lines: string[] = []
  const roots = (byParent.get(null) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))
  for (const root of roots) {
    const children = (byParent.get(root.id) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))
    if (children.length === 0) {
      lines.push(`- ${root.name} (${root.id})`)
    } else {
      const childList = children.map(c => `${c.name} (${c.id})`).join(', ')
      lines.push(`- ${root.name} (${root.id}): ${childList}`)
    }
  }
  return lines.join('\n')
}

