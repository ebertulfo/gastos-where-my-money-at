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
    expect(normalizeForEmbedding('POS GRAB SG')).toBe('GRAB SG SINGAPORE')
    expect(normalizeForEmbedding('PAYNOW TRANSFER TO JOHN')).toBe('TRANSFER TO JOHN')
    expect(normalizeForEmbedding('ATM WITHDRAWAL')).toBe('WITHDRAWAL')
  })

  it('expands country codes so two-letter tokens embed with full semantic weight', () => {
    // "AMAZON JP" should embed with "JAPAN" attached so a Japan tag can match
    // zero-shot via its description, and the raw "JP" stays for legacy KNN.
    expect(normalizeForEmbedding('AMAZON JP 2024-04-15 JPY 1500')).toBe('AMAZON JP JAPAN')
    expect(normalizeForEmbedding('ALIPAY HK 2024-04-15')).toBe('ALIPAY HK HONG KONG')
    expect(normalizeForEmbedding('MOBILE ICOCA OSAKA JP XXXX-XXXX-XXXX-0526')).toBe(
      'MOBILE ICOCA OSAKA JP JAPAN'
    )
  })

  it('does not expand high-collision codes that double as English words', () => {
    // "IN", "IT", "DE", "MY", "ID" are skipped to avoid false positives on
    // prepositions/pronouns that happen to match ISO-3166 codes.
    expect(normalizeForEmbedding('PAY IN FULL')).toBe('PAY IN FULL')
    expect(normalizeForEmbedding('IT SERVICES')).toBe('IT SERVICES')
    expect(normalizeForEmbedding('MAISON DE LA PAIX')).toBe('MAISON DE LA PAIX')
  })

  it('combines multiple noise sources into a clean merchant string', () => {
    const out = normalizeForEmbedding('POS GRAB*RIDE #1234 2024-04-15 SG  S$18.20')
    expect(out).toBe('GRAB RIDE SG SINGAPORE')
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
