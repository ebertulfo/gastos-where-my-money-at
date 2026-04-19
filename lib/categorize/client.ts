import Anthropic from '@anthropic-ai/sdk'

// Latest fast model. Cheap enough to run on every ingest, fast enough that
// the after()-hook completes well within Vercel's function budget.
export const CATEGORIZE_MODEL = 'claude-haiku-4-5' as const

let cachedClient: Anthropic | null = null

/**
 * Returns an Anthropic client if `ANTHROPIC_API_KEY` is configured.
 * Returns null in environments where the key isn't set (local dev without
 * a key, CI, preview deployments) — callers should treat this as "AI
 * tagging disabled" rather than an error.
 */
export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey })
  }
  return cachedClient
}

// Approximate per-million-token prices for claude-haiku-4-5 in USD cents.
// Used by the budget tracker to charge `ai_spent_this_month_cents` after
// each call without round-tripping to a billing API.
export const PRICE_INPUT_CENTS_PER_MTOK = 100      // $1.00 / Mtok
export const PRICE_OUTPUT_CENTS_PER_MTOK = 500     // $5.00 / Mtok
export const PRICE_CACHE_READ_CENTS_PER_MTOK = 10  // 90% off input
export const PRICE_CACHE_WRITE_CENTS_PER_MTOK = 125 // 25% premium on input

export interface UsageTokens {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

export function estimateUsageCents(usage: UsageTokens): number {
  const inputCost = (usage.inputTokens / 1_000_000) * PRICE_INPUT_CENTS_PER_MTOK
  const outputCost = (usage.outputTokens / 1_000_000) * PRICE_OUTPUT_CENTS_PER_MTOK
  const cacheReadCost = (usage.cacheReadInputTokens / 1_000_000) * PRICE_CACHE_READ_CENTS_PER_MTOK
  const cacheWriteCost = (usage.cacheCreationInputTokens / 1_000_000) * PRICE_CACHE_WRITE_CENTS_PER_MTOK
  // Round up to the nearest cent so we never under-charge the user's budget.
  return Math.ceil(inputCost + outputCost + cacheReadCost + cacheWriteCost)
}
