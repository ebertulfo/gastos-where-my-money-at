import { sanitizeDescription } from '@/lib/pdf/types'

// Bank statements pad merchant names with dates, transaction codes, currency
// markers, and network prefixes. Stripping them before embedding makes raw
// "STARBUCKS #4521 SG  S$7.50" line up with the cleaner forms the user has
// tagged before ("STARBUCKS").
export function normalizeForEmbedding(desc: string): string {
  let s = sanitizeDescription(desc)

  // Strip ISO-like dates and short date forms.
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
  s = s.replace(/\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b/g, ' ')

  // Strip currency-prefixed amounts (S$18.20, USD 7.50, EUR 3,40).
  s = s.replace(/\b[A-Z]{1,3}\$?\s?\d{1,3}(?:[.,]\d{1,3})*(?:[.,]\d{2})?\b/g, ' ')
  s = s.replace(/\b\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b/g, ' ')

  // Strip standalone currency codes.
  s = s.replace(/\b(SGD|USD|GBP|EUR|AUD|MYR|IDR|PHP|THB|JPY|HKD|CNY)\b/g, ' ')

  // Strip card-network reference numbers (#1234) and asterisks (used by
  // networks like Square `SQ*`, PayPal `PYPL*`, Grab `GRAB*RIDE`).
  s = s.replace(/#\s*\d+/g, ' ')
  s = s.replace(/\*/g, ' ')

  // Strip common bank/payment-rail prefixes.
  s = s.replace(/\b(POS|ATM|NEFT|PAYNOW|GIRO|FAST|IBG|EFT|ACH|TXN|REF|RRN|AUTH)\b/gi, ' ')

  // Strip trailing/embedded 2-letter country codes that some banks tack on.
  s = s.replace(/\b(SG|US|GB|UK|MY|ID|PH|TH|JP|AU|CA|NZ|HK|EU|AE|DE|FR)\b/g, ' ')

  // Collapse whitespace, uppercase, trim.
  s = s.replace(/\s+/g, ' ').trim().toUpperCase()

  return s
}
