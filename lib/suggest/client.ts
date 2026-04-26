import OpenAI from 'openai'

// Mini, not nano. Tested both on real JP-merchant data: nano left the
// majority of foreign-merchant rows uncategorized even with the new prompt
// + batch JSON tool call; mini handles them. The ~4x token cost is worth
// it — categorization quality is what makes the product feel non-shitty.
// Pricing: $0.75 input / $4.50 output per Mtok.
export const LLM_MODEL = 'gpt-5.4-mini' as const

// 1536-dim is plenty for ~10-token transaction descriptions; -large would
// burn 6.5x the budget for a quality jump that doesn't matter at our scale.
export const EMBEDDING_MODEL = 'text-embedding-3-small' as const

let cachedClient: OpenAI | null = null

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPEN_AI_API_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey })
  }
  return cachedClient
}

// USD cents per 1M tokens. gpt-5.4-mini: $0.75 input / $4.50 output, cached
// input is 90% off per OpenAI's standard caching discount.
export const PRICE_LLM_INPUT_CENTS_PER_MTOK = 75
export const PRICE_LLM_OUTPUT_CENTS_PER_MTOK = 450
export const PRICE_LLM_CACHED_INPUT_CENTS_PER_MTOK = 7

// text-embedding-3-small: $0.02/Mtok.
export const PRICE_EMBEDDING_CENTS_PER_MTOK = 2

export interface LLMUsage {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}

export function estimateLLMCents(usage: LLMUsage): number {
  const billableInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens)
  const inputCost = (billableInput / 1_000_000) * PRICE_LLM_INPUT_CENTS_PER_MTOK
  const cacheCost = (usage.cachedInputTokens / 1_000_000) * PRICE_LLM_CACHED_INPUT_CENTS_PER_MTOK
  const outputCost = (usage.outputTokens / 1_000_000) * PRICE_LLM_OUTPUT_CENTS_PER_MTOK
  return Math.ceil(inputCost + cacheCost + outputCost)
}

export function estimateEmbeddingCents(tokens: number): number {
  return Math.ceil((tokens / 1_000_000) * PRICE_EMBEDDING_CENTS_PER_MTOK)
}
