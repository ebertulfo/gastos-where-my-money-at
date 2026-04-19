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

  it('strips bank/payment-rail prefixes (and trailing country codes)', () => {
    expect(normalizeForEmbedding('POS GRAB SG')).toBe('GRAB')
    expect(normalizeForEmbedding('PAYNOW TRANSFER TO JOHN')).toBe('TRANSFER TO JOHN')
    expect(normalizeForEmbedding('ATM WITHDRAWAL')).toBe('WITHDRAWAL')
  })

  it('combines multiple noise sources into a clean merchant string', () => {
    const out = normalizeForEmbedding('POS GRAB*RIDE #1234 2024-04-15 SG  S$18.20')
    expect(out).toBe('GRAB RIDE')
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
