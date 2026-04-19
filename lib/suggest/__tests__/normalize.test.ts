import { describe, expect, it } from 'vitest'
import { normalizeForEmbedding } from '../normalize'

describe('normalizeForEmbedding', () => {
  it('strips ISO dates from the end of a description', () => {
    const out = normalizeForEmbedding('GRAB*RIDE 2024-04-15')
    expect(out).toBe('GRAB RIDE')
  })

  it('strips short slash dates', () => {
    const out = normalizeForEmbedding('STARBUCKS 04/15')
    expect(out).toBe('STARBUCKS')
  })

  it('strips currency-prefixed amounts', () => {
    const out = normalizeForEmbedding('NTUC FAIRPRICE S$45.20')
    expect(out).toBe('NTUC FAIRPRICE')
  })

  it('strips standalone currency codes', () => {
    const out = normalizeForEmbedding('NETFLIX SUBSCRIPTION USD 15.99')
    expect(out).toBe('NETFLIX SUBSCRIPTION')
  })

  it('strips card-network markers and reference numbers', () => {
    const out = normalizeForEmbedding('STARBUCKS #4521')
    expect(out).toBe('STARBUCKS')
  })

  it('strips bank/payment-rail prefixes but preserves country codes', () => {
    expect(normalizeForEmbedding('POS GRAB SG')).toBe('GRAB SG')
    expect(normalizeForEmbedding('PAYNOW TRANSFER TO JOHN')).toBe('TRANSFER TO JOHN')
    expect(normalizeForEmbedding('ATM WITHDRAWAL')).toBe('WITHDRAWAL')
  })

  it('preserves country/locale tokens that carry categorisation signal', () => {
    // "AMAZON JP" must embed differently from "AMAZON" so a Japan-focused
    // user can train KNN on JP-prefixed merchants.
    expect(normalizeForEmbedding('AMAZON JP 2024-04-15 JPY 1500')).toBe('AMAZON JP')
    expect(normalizeForEmbedding('ALIPAY HK 2024-04-15')).toBe('ALIPAY HK')
  })

  it('combines multiple noise sources into a clean merchant string', () => {
    const out = normalizeForEmbedding('POS GRAB*RIDE #1234 2024-04-15 SG  S$18.20')
    expect(out).toBe('GRAB RIDE SG')
  })

  it('uppercases and collapses whitespace', () => {
    const out = normalizeForEmbedding('  toast   box  ')
    expect(out).toBe('TOAST BOX')
  })

  it('returns empty string for descriptions that are pure noise', () => {
    const out = normalizeForEmbedding('SGD 100.00')
    expect(out).toBe('')
  })
})
