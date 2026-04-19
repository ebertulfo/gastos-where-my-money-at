import { getOpenAIClient, LLM_MODEL, estimateLLMCents } from './client'
import { checkBudget, incrementSpend } from './budget'

const TOOL_NAME = 'record_tag_description'

const TOOL_PARAMETERS = {
  type: 'object' as const,
  properties: {
    description: {
      type: 'string' as const,
      description:
        'Comma-separated semantic cues (countries, currencies, merchant names, transaction verbs). No full sentences.',
    },
  },
  required: ['description'],
}

const SYSTEM_PROMPT = `You generate semantic cues that help a merchant-text embedding model recognise which personal-finance tag a bank transaction belongs to.

Given a tag name, produce 1-2 lines of comma-separated cues that might appear in raw merchant descriptions on a bank statement. Focus on:
- Country codes and currencies (e.g. "JP JPY" for Japan, "SG SGD S$" for Singapore)
- Known brand / merchant names in that category
- Transaction verbs and payment-rail terms
- City names, if the tag is location-specific

Do not write prose, explanations, or preamble. Output cues only.`

/**
 * Asks the LLM for a short, embedding-friendly description of a tag name.
 * Used on tag creation (and the "Refresh AI" UI affordance) to seed the
 * tag's description column so its embedding has real signal beyond the
 * name itself.
 *
 * Returns null when the caller is over budget, the API key is missing, or
 * the model misbehaves — the calling action should fall back to leaving
 * the description blank rather than failing the write.
 */
export async function seedTagDescriptionViaLLM(args: {
  userId: string
  tagName: string
}): Promise<string | null> {
  const client = getOpenAIClient()
  if (!client) return null

  const budget = await checkBudget(args.userId)
  if (!budget.allowed) return null

  let response
  try {
    response = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Tag name: ${args.tagName}` },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: TOOL_NAME,
            description: 'Record the tag description.',
            parameters: TOOL_PARAMETERS,
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: TOOL_NAME } },
    })
  } catch {
    return null
  }

  const toolCall = response.choices[0]?.message?.tool_calls?.[0]
  if (!toolCall || toolCall.type !== 'function') return null

  let parsed: { description?: string }
  try {
    parsed = JSON.parse(toolCall.function.arguments)
  } catch {
    return null
  }

  const usage = response.usage
  const cents = estimateLLMCents({
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
  })
  if (cents > 0) await incrementSpend(args.userId, cents)

  const desc = parsed.description?.trim()
  return desc && desc.length > 0 ? desc : null
}
