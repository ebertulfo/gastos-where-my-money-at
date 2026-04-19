import OpenAI from 'openai'

// Cheap, fast, JSON-tool-call friendly. The categorisation prompt is small
// and the per-batch output is bounded, so a small model is the right pick.
export const CATEGORIZE_MODEL = 'gpt-4o-mini' as const

let cachedClient: OpenAI | null = null

/**
 * Returns an OpenAI client if `OPEN_AI_API_KEY` (or the standard
 * `OPENAI_API_KEY`) is configured. Returns null otherwise — callers
 * should treat that as "AI tagging disabled" rather than an error.
 */
export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPEN_AI_API_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey })
  }
  return cachedClient
}

// USD cents per 1M tokens for gpt-4o-mini. Used by the budget tracker so we
// can charge `ai_spent_this_month_cents` after each call without round-
// tripping to a billing API. Cached input is 50% off; OpenAI bills cache
// reads automatically when present in `usage.prompt_tokens_details.cached_tokens`.
export const PRICE_INPUT_CENTS_PER_MTOK = 15       // $0.15 / Mtok
export const PRICE_OUTPUT_CENTS_PER_MTOK = 60      // $0.60 / Mtok
export const PRICE_CACHE_READ_CENTS_PER_MTOK = 8   // ~$0.075 / Mtok, rounded up

export interface UsageTokens {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}

export function estimateUsageCents(usage: UsageTokens): number {
  const billableInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens)
  const inputCost = (billableInput / 1_000_000) * PRICE_INPUT_CENTS_PER_MTOK
  const cacheCost = (usage.cachedInputTokens / 1_000_000) * PRICE_CACHE_READ_CENTS_PER_MTOK
  const outputCost = (usage.outputTokens / 1_000_000) * PRICE_OUTPUT_CENTS_PER_MTOK
  // Round up to the nearest cent so we never under-charge against the budget.
  return Math.ceil(inputCost + cacheCost + outputCost)
}
