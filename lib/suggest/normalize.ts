import { sanitizeDescription } from '@/lib/pdf/types'

// ISO-3166-1 alpha-2 codes seen in merchant text, expanded to their country
// names so a two-letter token like "JP" embeds with the full semantic weight
// of "Japan". We expand (not replace): "AMAZON JP" becomes "AMAZON JP JAPAN"
// so existing KNN hits on the bare code still match.
//
// The map deliberately excludes high-collision codes that are also common
// English/French tokens at merchant-text frequency: IT (pronoun), IN
// (preposition), ID (identification abbrev), DE (French preposition), MY
// (possessive). Users from those countries still benefit via their tag
// descriptions carrying the expansion.
const COUNTRY_CODE_EXPANSIONS: Record<string, string> = {
  SG: 'SINGAPORE',
  JP: 'JAPAN',
  US: 'UNITED STATES',
  GB: 'UNITED KINGDOM',
  UK: 'UNITED KINGDOM',
  AU: 'AUSTRALIA',
  PH: 'PHILIPPINES',
  TH: 'THAILAND',
  HK: 'HONG KONG',
  CN: 'CHINA',
  KR: 'SOUTH KOREA',
  TW: 'TAIWAN',
  VN: 'VIETNAM',
  FR: 'FRANCE',
  ES: 'SPAIN',
  NL: 'NETHERLANDS',
  CH: 'SWITZERLAND',
  CA: 'CANADA',
  NZ: 'NEW ZEALAND',
  AE: 'UNITED ARAB EMIRATES',
}

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

  // Strip masked card / account numbers written with literal X's
  // (e.g. "XXXX-XXXX-XXXX-0526", "XXXX 1234"). Requires at least one run
  // of 3+ X's so we don't clip merchant names containing an X.
  s = s.replace(/\bX{3,}(?:[-\s]*[X\d]+)*\b/gi, ' ')

  // Strip common bank/payment-rail prefixes.
  s = s.replace(/\b(POS|ATM|NEFT|PAYNOW|GIRO|FAST|IBG|EFT|ACH|TXN|REF|RRN|AUTH)\b/gi, ' ')

  // NOTE: We deliberately do NOT strip country codes (SG, JP, US, …). They
  // carry meaningful signal — "AMAZON JP" vs "AMAZON" should embed
  // differently because the user often categorises them differently
  // (Travel/Japan vs Shopping). Same for currency codes attached to merchant
  // names like "ALIPAY HK".

  // Catch any remaining standalone integers ≥3 digits — these are leftover
  // amounts (esp. JPY/IDR with no decimal), reference codes, or store
  // numbers. Two-digit numbers are kept (street numbers, "F&B 24" outlet
  // names, etc.).
  s = s.replace(/\b\d{3,}\b/g, ' ')

  // Collapse whitespace, uppercase, trim.
  s = s.replace(/\s+/g, ' ').trim().toUpperCase()

  // Expand country codes. Done after uppercasing so the lookup is
  // case-safe, and only on whole-word boundaries so we don't mangle tokens
  // like "JPMORGAN" or "USDT". The original code stays in the string too.
  s = s.replace(/\b([A-Z]{2})\b/g, (match, code) => {
    const expansion = COUNTRY_CODE_EXPANSIONS[code as string]
    return expansion ? `${code} ${expansion}` : match
  })

  return s
}
