import { embedTexts } from './embed'
import { suggestViaLLM } from './llm'
import type { NeighbourRow, NeighbourTag, TagNode, TagSuggestion } from './types'

const STRONG_THRESHOLD = 0.75
const WEAK_THRESHOLD = 0.5
const KNN_LIMIT = 20
const MIN_STRONG_FOR_PURE_KNN = 3
const PRIMARY_WEIGHT_MULTIPLIER = 1.5

interface SuggestArgs {
  supabase: any
  userId: string
  transactionId: string
  limit?: number
}

interface TransactionRow {
  id: string
  description: string
  amount: number
  date: string
  description_embedding: number[] | null
}

/**
 * Hybrid: KNN over the user's tagged history when there's enough signal,
 * LLM fallback (with weak KNN hits as few-shot) otherwise. Always runs
 * hierarchy collapse before returning so child tags win over their parents.
 */
export async function suggestTagsForTransaction(args: SuggestArgs): Promise<TagSuggestion[]> {
  const { supabase, userId, transactionId } = args
  const limit = args.limit ?? 5

  // 1. Fetch the transaction (and its embedding if present).
  const { data: txData, error: txError } = await supabase
    .from('transactions')
    .select('id, description, amount, date, description_embedding')
    .eq('id', transactionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (txError || !txData) return []
  const tx = txData as TransactionRow

  // 2. Lazily embed if missing. embedTexts also persists nothing — we
  // only need the vector for the KNN below; if we want to persist, do it
  // best-effort in the background.
  let txEmbedding = tx.description_embedding
  if (!txEmbedding) {
    const result = await embedTexts([tx.description])
    if (!result || result.embeddings.length === 0) {
      // No API key / failure → skip KNN, go straight to LLM (which will also
      // bail without a key, returning [] gracefully).
      txEmbedding = null
    } else {
      txEmbedding = result.embeddings[0]
      // Persist asynchronously; suggestion latency doesn't depend on this.
      supabase
        .from('transactions')
        .update({ description_embedding: txEmbedding as any })
        .eq('id', transactionId)
        .then(() => undefined, () => undefined)
    }
  }

  // 3. Fetch user's tags (always — needed for both paths).
  const { data: tagsData } = await supabase
    .from('tags')
    .select('id, name, color, parent_id')
    .eq('user_id', userId)

  const tags: TagNode[] = ((tagsData ?? []) as { id: string; name: string; color: string | null; parent_id: string | null }[]).map(t => ({
    id: t.id,
    name: t.name,
    color: t.color,
    parentId: t.parent_id,
  }))

  if (tags.length === 0) return []

  // 4. KNN — only if we have an embedding for the target transaction.
  let strong: NeighbourRow[] = []
  let weak: NeighbourRow[] = []
  if (txEmbedding) {
    const neighbours = await knnNeighbours(supabase, userId, transactionId, txEmbedding)
    for (const n of neighbours) {
      if (n.similarity >= STRONG_THRESHOLD) strong.push(n)
      else if (n.similarity >= WEAK_THRESHOLD) weak.push(n)
    }
  }

  // 5. Decision branch.
  let raw: TagSuggestion[]
  if (strong.length >= MIN_STRONG_FOR_PURE_KNN) {
    raw = voteFromKNN(strong, limit, 'knn')
  } else {
    // Country lookup for the LLM prompt.
    const { data: settingsData } = await supabase
      .from('user_settings')
      .select('country')
      .eq('user_id', userId)
      .maybeSingle()
    const country = (settingsData as { country?: string } | null)?.country ?? null

    const llmSuggestions = await suggestViaLLM({
      userId,
      tx: { description: tx.description, amount: tx.amount, date: tx.date },
      tags,
      fewShotNeighbours: weak,
      userCountry: country,
    })

    // Annotate any LLM tag IDs that ALSO showed up in the KNN candidates as
    // 'mixed' rather than 'llm' — those have signal from both sides.
    const knnTagIds = new Set<string>()
    for (const n of [...strong, ...weak]) {
      for (const t of n.tags) knnTagIds.add(t.tagId)
    }
    raw = llmSuggestions.map(s => ({
      ...s,
      source: knnTagIds.has(s.tagId) ? 'mixed' : 'llm',
    }))
  }

  // 6. Hierarchy collapse — drop ancestors whose descendants are already in.
  const collapsed = collapseHierarchy(raw, tags)

  return collapsed.slice(0, limit)
}

interface KNNRowJoin {
  id: string
  description: string
  similarity: number
  transaction_tags: { tag_id: string; is_primary: boolean }[]
}

async function knnNeighbours(
  supabase: any,
  userId: string,
  excludeId: string,
  embedding: number[],
): Promise<NeighbourRow[]> {
  // Postgres function call would be cleanest, but supabase-js + pgvector via
  // the REST API also accepts an `order` on a vector distance expression
  // when wrapped in an RPC. We use a raw RPC for clarity and to project
  // similarity in one trip.
  const { data, error } = await supabase.rpc('knn_neighbour_tags', {
    p_user_id: userId,
    p_exclude_id: excludeId,
    p_embedding: embedding as unknown as string,
    p_limit: KNN_LIMIT,
  })

  if (error || !data) return []

  return (data as KNNRowJoin[]).map(r => ({
    transactionId: r.id,
    description: r.description,
    similarity: r.similarity,
    tags: (r.transaction_tags ?? []).map(t => ({ tagId: t.tag_id, isPrimary: t.is_primary })),
  }))
}

function voteFromKNN(neighbours: NeighbourRow[], limit: number, source: 'knn' | 'mixed'): TagSuggestion[] {
  const scores = new Map<string, number>()
  for (const n of neighbours) {
    for (const t of n.tags) {
      const weight = n.similarity * (t.isPrimary ? PRIMARY_WEIGHT_MULTIPLIER : 1)
      scores.set(t.tagId, (scores.get(t.tagId) ?? 0) + weight)
    }
  }
  const entries = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return []
  const top = entries[0][1]
  return entries.slice(0, limit).map(([tagId, score]) => ({
    tagId,
    confidence: top > 0 ? score / top : 0,
    source,
  }))
}

/**
 * Drops any tag whose descendant is also in the output. "Coffee" wins over
 * "Food" if both score; transitive (grandchild → grandparent) is handled too.
 */
export function collapseHierarchy(suggestions: TagSuggestion[], tags: TagNode[]): TagSuggestion[] {
  if (suggestions.length === 0) return suggestions

  const parentOf = new Map<string, string | null>(tags.map(t => [t.id, t.parentId]))

  function ancestorsOf(tagId: string): string[] {
    const out: string[] = []
    let cur = parentOf.get(tagId) ?? null
    const seen = new Set<string>([tagId])
    while (cur && !seen.has(cur)) {
      out.push(cur)
      seen.add(cur)
      cur = parentOf.get(cur) ?? null
    }
    return out
  }

  // Any suggested tag that is an ancestor of any OTHER suggested tag gets
  // suppressed. Order is preserved.
  const suggestedIds = new Set(suggestions.map(s => s.tagId))
  const suppress = new Set<string>()
  for (const s of suggestions) {
    for (const ancestorId of ancestorsOf(s.tagId)) {
      if (suggestedIds.has(ancestorId)) suppress.add(ancestorId)
    }
  }
  return suggestions.filter(s => !suppress.has(s.tagId))
}
