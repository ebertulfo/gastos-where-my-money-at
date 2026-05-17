import { getOpenAIClient, LLM_MODEL, estimateLLMCents } from './client'
import { friendlyCountry } from './locale'
import type { NeighbourRow, TagNode, TagSuggestion } from './types'
import { checkBudget, incrementSpend } from './budget'

const TOOL_NAME = 'record_tag_suggestions'

const TOOL_PARAMETERS = {
  type: 'object' as const,
  properties: {
    tagIds: {
      type: 'array' as const,
      description: 'Tag IDs ordered best-first. Empty array if nothing fits.',
      items: { type: 'string' as const },
    },
  },
  required: ['tagIds'],
}

interface InputTransaction {
  description: string
  amount: number
  date: string
}

function renderVocabulary(tags: TagNode[]): string {
  // Group by parent so the model sees the hierarchy explicitly.
  const byParent = new Map<string | null, TagNode[]>()
  for (const tag of tags) {
    const parent = tag.parentId ?? null
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent)!.push(tag)
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

function renderFewShot(neighbours: NeighbourRow[], tagsById: Map<string, TagNode>): string {
  if (neighbours.length === 0) return ''
  const lines = ['', 'Recent examples of how this user tags:']
  for (const n of neighbours.slice(0, 5)) {
    const primary = n.tags.find(t => t.isPrimary) ?? n.tags[0]
    if (!primary) continue
    const tagName = tagsById.get(primary.tagId)?.name ?? 'Untagged'
    lines.push(`- "${n.description}" → ${tagName}`)
  }
  return lines.join('\n')
}

export async function suggestViaLLM(args: {
  userId: string
  tx: InputTransaction
  tags: TagNode[]
  fewShotNeighbours: NeighbourRow[]
  userCountry: string | null
}): Promise<TagSuggestion[]> {
  const client = getOpenAIClient()
  if (!client) return []
  if (args.tags.length === 0) return []

  const budget = await checkBudget(args.userId)
  if (!budget.allowed) return []

  const tagsById = new Map(args.tags.map(t => [t.id, t]))
  const validTagIds = new Set(args.tags.map(t => t.id))
  const country = friendlyCountry(args.userCountry)

  const systemPrompt = `You categorise bank transactions for a user in ${country}.

They use these tags (you MUST pick from these IDs only):
${renderVocabulary(args.tags)}
${renderFewShot(args.fewShotNeighbours, tagsById)}

Rules:
1. Prefer the most specific tag (a child like "Coffee" over its parent "Food").
2. Always return at least 1 tag (up to 5), ranked best-first — best match first,
   weaker guesses after. Even for loose fits, pick the closest option in the
   vocabulary so the user sees a starting point they can accept or dismiss.
3. Only return an empty array if the vocabulary is so unrelated that no tag
   is even remotely applicable.
4. Never invent IDs. Only use IDs that appear in the vocabulary above.`

  let response
  try {
    response = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Categorise this transaction:\n\`\`\`json\n${JSON.stringify(args.tx)}\n\`\`\``,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: TOOL_NAME,
            description: 'Record up to 5 ranked tag IDs for the transaction.',
            parameters: TOOL_PARAMETERS,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: TOOL_NAME } },
    })
  } catch {
    return []
  }

  const toolCall = response.choices[0]?.message?.tool_calls?.[0]
  if (!toolCall || toolCall.type !== 'function') return []

  let parsed: { tagIds?: string[] }
  try {
    parsed = JSON.parse(toolCall.function.arguments)
  } catch {
    return []
  }

  const usage = response.usage
  const cents = estimateLLMCents({
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
  })
  if (cents > 0) await incrementSpend(args.userId, cents)

  const raw = (parsed.tagIds ?? []).filter(id => validTagIds.has(id))
  // Confidence here is just rank-based since the LLM doesn't return logprobs:
  // first slot = 1.0, decaying linearly toward the last.
  const total = raw.length
  return raw.map((tagId, i) => ({
    tagId,
    confidence: total === 1 ? 1 : 1 - i / total,
    source: 'llm' as const,
  }))
}

const TRIP_TOOL = 'record_trip_name'
const TRIP_TOOL_PARAMETERS = {
  type: 'object' as const,
  properties: {
    name: {
      type: 'string' as const,
      description:
        'Lowercase trip label, 2-6 words. Format like "bali · aug 14-21, 2025" — destination, then date range. Use the most likely destination inferred from merchant strings + currency. If unsure, fall back to "trip · MMM d-d, YYYY".',
    },
  },
  required: ['name'],
}

interface NameTripArgs {
  userId: string
  /** Cluster member descriptions (already trimmed/sanitized — we send up to 30). */
  descriptions: string[]
  /** YYYY-MM-DD. */
  startDate: string
  /** YYYY-MM-DD. */
  endDate: string
  /** Currencies seen in the cluster (e.g. ['IDR', 'SGD']). */
  currencies: string[]
  userCountry: string | null
  /** User's home currency, so the model can ignore it as a destination signal. */
  homeCurrency: string | null
}

/**
 * One LLM round-trip per cluster. Asks the model to name the trip from its
 * merchant strings + date range + foreign currencies. Returns null if the
 * call fails or budget is exhausted; the caller should fall back to a
 * deterministic name.
 */
export async function nameTripCluster(args: NameTripArgs): Promise<string | null> {
  const client = getOpenAIClient()
  if (!client) return null

  const budget = await checkBudget(args.userId)
  if (!budget.allowed) return null

  const country = friendlyCountry(args.userCountry)
  const homeNote = args.homeCurrency ? ` Their home currency is ${args.homeCurrency}.` : ''
  const foreignCurrencies = args.currencies.filter(
    c => c.toUpperCase() !== (args.homeCurrency ?? '').toUpperCase(),
  )
  const currencyNote =
    foreignCurrencies.length > 0
      ? ` Foreign currencies on the cluster: ${foreignCurrencies.join(', ')}.`
      : ''

  const systemPrompt = `You name spending clusters for a personal-finance app.${homeNote}${currencyNote}

The user lives in ${country} and just got back from somewhere. From the merchant strings + dates, infer the most likely destination (city or country) and produce a short trip label.

Rules:
- 2-6 words, lowercase, format "<destination> · <month> <d>-<d>, <year>".
- If the cluster spans two months: "<destination> · <mon1> <d>-<mon2> <d>, <year>".
- Prefer city over country when merchant strings clearly point to one (e.g. tokyo vs japan).
- If destination is unclear, use "trip · <date range>".
- Never include the home currency.
- Never invent a destination not supported by merchant or currency evidence.`

  const userMessage = `Cluster spans ${args.startDate} → ${args.endDate}. Merchants:
\`\`\`
${args.descriptions.slice(0, 30).join('\n')}
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
            name: TRIP_TOOL,
            description: 'Record the proposed trip label.',
            parameters: TRIP_TOOL_PARAMETERS,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: TRIP_TOOL } },
    })
  } catch (err) {
    console.warn('nameTripCluster LLM call failed', err)
    return null
  }

  const usage = response.usage
  const cents = estimateLLMCents({
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
  })
  if (cents > 0) await incrementSpend(args.userId, cents)

  const toolCall = response.choices[0]?.message?.tool_calls?.[0]
  if (!toolCall || toolCall.type !== 'function') return null

  let parsed: { name?: string }
  try {
    parsed = JSON.parse(toolCall.function.arguments)
  } catch {
    return null
  }

  const name = (parsed.name ?? '').trim().toLowerCase()
  if (!name) return null
  return name
}
