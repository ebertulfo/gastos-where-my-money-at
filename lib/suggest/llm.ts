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
