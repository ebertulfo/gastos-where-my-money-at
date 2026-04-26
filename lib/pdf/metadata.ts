/**
 * Statement-header metadata extractor.
 *
 * Runs against raw page text BEFORE description sanitisation so we can pull
 * the canonical statement period, bank, statement type, account last-4 and
 * currency directly from the header. Used by the ingest pipeline so we
 * stop guessing periods from min/max(transaction dates) and so we can
 * resolve cross-year transactions ("30 DEC" + "26 JAN" on the same
 * statement) without relying on the system clock.
 *
 * Personal info (full name, address, full PAN) lives in the same text and
 * is NEVER surfaced from this module — only the small derived fields
 * defined in StatementMetadata escape.
 */

import type { StatementProfile } from './profiles'
import { ALTITUDE_PROFILE, DBS_PROFILE, GENERIC_PROFILE } from './profiles'

export type ParsedStatementType = 'debit' | 'credit' | 'investment'

/**
 * Reconciliation kinds — how the review screen should compare
 * `expectedTotal` against the sum of extracted transaction_imports.
 *
 *   cc_new_charges_signed
 *     Credit cards. expectedTotal = total_outstanding − previous_balance
 *     (i.e. the net new activity for the cycle, signed). Compare against
 *     sum(extracted, signed). Difference of ~0 = full reconciliation.
 *
 *   bank_withdrawals_abs
 *     Bank statements. expectedTotal = total withdrawals printed at the
 *     end of the document. Compare against sum(abs(extracted))
 *     because the bank-statement parser only emits withdrawals.
 */
export type ExpectedTotalKind = 'cc_new_charges_signed' | 'bank_withdrawals_abs'

export type StatementMetadata = {
  bank: string | null
  statementType: ParsedStatementType
  periodStart: string | null // YYYY-MM-DD
  periodEnd: string | null   // YYYY-MM-DD
  accountLast4: string | null
  currency: string | null
  /** Reconcile-against figure printed on the statement. */
  expectedTotal: number | null
  /** How to interpret expectedTotal. */
  expectedTotalKind: ExpectedTotalKind | null
  /** Credit cards only — opening balance of the cycle. */
  previousBalance: number | null
}

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function toIsoDate(day: number, month: number, year: number): string | null {
  if (!day || !month || !year) return null
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Parses "30 Dec 2025" / "30 December 2025" / "30/12/2025" / "2025-12-30". */
export function parseDateLoose(input: string): { day: number; month: number; year: number } | null {
  const s = input.trim()
  if (!s) return null

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }

  // DD/MM/YYYY or DD-MM-YYYY (DD comes first; SG/UK convention).
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) }

  // DD MMM YYYY / DD Month YYYY (allow trailing punctuation).
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/)
  if (m) {
    const month = MONTH_LOOKUP[m[2].toLowerCase()]
    if (!month) return null
    return { day: Number(m[1]), month, year: Number(m[3]) }
  }

  return null
}

function firstCapture(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m && m[1] ? m[1].trim() : null
}

function extractDateAfterAnchor(text: string, anchor: RegExp): string | null {
  const captured = firstCapture(text, anchor)
  if (!captured) return null
  const parsed = parseDateLoose(captured)
  if (!parsed) return null
  return toIsoDate(parsed.day, parsed.month, parsed.year)
}

/**
 * Last four digits of a stored card / account number, sniffed before
 * sanitisation but not retained anywhere except this small string.
 */
function extractCardLast4(text: string): string | null {
  // Visa/MC PAN with the standard 4-4-4-4 spacing seen in DBS / OCBC / UOB
  // cards. Tolerates either spaces or hyphens between groups.
  const m = text.match(/\b\d{4}[\s-]+\d{4}[\s-]+\d{4}[\s-]+(\d{4})\b/)
  return m ? m[1] : null
}

function extractCurrency(text: string): string | null {
  // Prefer explicit ISO codes; fall back to S$ shorthand.
  const iso = text.match(/\b(SGD|USD|EUR|GBP|AUD|MYR|IDR|PHP|THB|JPY|HKD|CNY)\b/)
  if (iso) return iso[1]
  if (/\bS\$/.test(text)) return 'SGD'
  return null
}

/** Parses "1,234.56" / "1234.56" / "$1,234.56". null on failure. */
function parseAmount(s: string): number | null {
  const cleaned = s.replace(/[$\s]/g, '').replace(/,/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// --- Profile-specific extractors ---------------------------------------------

function extractAltitudeMetadata(text: string): StatementMetadata {
  // STATEMENT DATE is the cycle close; the figure on the next line uses
  // "30 Dec 2025" formatting in DBS Altitude statements. We capture that
  // and use it as period_end. period_start is the date of the earliest
  // transaction the parser surfaces — so we leave it null here and let
  // the caller fill from the row span.
  const periodEnd = extractDateAfterAnchor(
    text,
    // Tolerate the column-style header on the line above the value.
    /STATEMENT\s+DATE[\s\S]{0,80}?(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i,
  )

  const accountLast4 = extractCardLast4(text)

  const bank =
    /DBS\s+ALTITUDE/i.test(text) || /DBS\s+Cards/i.test(text)
      ? 'DBS'
      : null

  // Reconciliation anchor for credit cards. The parser emits ONLY the
  // "NEW TRANSACTIONS" section, skipping any pre-section bill-payment
  // line that clears the previous balance. So the right figure to
  // reconcile against is the SUB-TOTAL printed for each card (= sum of
  // new charges for that card, signed). On a multi-card consolidated
  // statement there are several SUB-TOTAL lines, one per card, so we sum
  // them all. PREVIOUS BALANCE is captured for display but no longer
  // part of the reconciliation arithmetic.
  const previousBalanceMatch = text.match(/PREVIOUS\s+BALANCE\s+([\d,]+\.\d{2})/i)
  const previousBalance = previousBalanceMatch ? parseAmount(previousBalanceMatch[1]) : null

  const subTotalMatches = [...text.matchAll(/\bSUB-TOTAL[:\s]+([\d,]+\.\d{2})/gi)]
  let expectedTotal: number | null = null
  let expectedTotalKind: ExpectedTotalKind | null = null
  if (subTotalMatches.length > 0) {
    let sum = 0
    let valid = true
    for (const m of subTotalMatches) {
      const v = parseAmount(m[1])
      if (v === null) { valid = false; break }
      sum += v
    }
    if (valid) {
      expectedTotal = Number(sum.toFixed(2))
      expectedTotalKind = 'cc_new_charges_signed'
    }
  }

  return {
    bank,
    statementType: 'credit',
    periodStart: null,
    periodEnd,
    accountLast4,
    currency: extractCurrency(text),
    expectedTotal,
    expectedTotalKind,
    previousBalance,
  }
}

function extractDbsDepositMetadata(text: string): StatementMetadata {
  // DBS/POSB consolidated statements anchor on "as at DD MMM YYYY" or
  // "Account Summary as of DD MMM YYYY". Both are reliable period_end
  // markers; period_start is first-of-the-month.
  const periodEnd =
    extractDateAfterAnchor(text, /as\s+at\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i) ??
    extractDateAfterAnchor(text, /Account\s+Summary\s+as\s+of\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i) ??
    extractDateAfterAnchor(text, /as\s+of\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)

  let periodStart: string | null = null
  if (periodEnd) {
    const parsed = parseDateLoose(periodEnd)
    if (parsed) periodStart = toIsoDate(1, parsed.month, parsed.year)
  }

  // Detect the dominant section: a consolidated statement with both a
  // Deposits block and a smaller Investment block is fundamentally a bank
  // statement. We treat investment-only documents (no deposits) as
  // 'investment'.
  const hasDeposits = /(DBS\s+Multiplier|eMySavings|Current\s+and\s+Savings|Deposit)/i.test(text)
  const hasInvestments = /(Unit\s+Trusts|Market\s+Value|Investment)/i.test(text)
  const statementType: ParsedStatementType = hasDeposits
    ? 'debit'
    : hasInvestments
      ? 'investment'
      : 'debit'

  // POSB and DBS coexist on the same consolidated statement; surface the
  // pairing when both are referenced.
  const mentionsPosb = /\bPOSB\b/i.test(text)
  const mentionsDbs = /\bDBS\b/i.test(text)
  const bank = mentionsDbs && mentionsPosb ? 'DBS/POSB' : mentionsDbs ? 'DBS' : mentionsPosb ? 'POSB' : null

  // Reconciliation anchor — DBS/POSB statements print a master roll-up
  // line "Total Balance Carried Forward in SGD: <withdrawals> <deposits>
  // <closing>". Withdrawals total is the cleanest figure to reconcile
  // against because the bank-statement parser emits withdrawals only.
  const totalRollup = text.match(
    /Total\s+Balance\s+Carried\s+Forward\s+in\s+SGD[:\s]+([\d,]+\.\d{2})\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}/i,
  )
  let expectedTotal: number | null = null
  let expectedTotalKind: ExpectedTotalKind | null = null
  if (totalRollup) {
    const withdrawals = parseAmount(totalRollup[1])
    if (withdrawals !== null) {
      expectedTotal = withdrawals
      expectedTotalKind = 'bank_withdrawals_abs'
    }
  }

  return {
    bank,
    statementType,
    periodStart,
    periodEnd,
    accountLast4: null,
    currency: extractCurrency(text),
    expectedTotal,
    expectedTotalKind,
    previousBalance: null,
  }
}

function extractGenericMetadata(text: string): StatementMetadata {
  // Generic best-effort: explicit "Statement Period" range first, then the
  // common bank-statement anchor, then credit-card style.
  const rangeMatch = text.match(
    /Statement\s+Period[:\s]+(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*(?:[-–to]+|–|—)\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i,
  )

  let periodStart: string | null = null
  let periodEnd: string | null = null
  if (rangeMatch) {
    const a = parseDateLoose(rangeMatch[1])
    const b = parseDateLoose(rangeMatch[2])
    if (a) periodStart = toIsoDate(a.day, a.month, a.year)
    if (b) periodEnd = toIsoDate(b.day, b.month, b.year)
  } else {
    periodEnd =
      extractDateAfterAnchor(text, /STATEMENT\s+DATE[\s\S]{0,80}?(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i) ??
      extractDateAfterAnchor(text, /as\s+at\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i) ??
      extractDateAfterAnchor(text, /as\s+of\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)
  }

  // Bank token sweep — first known issuer wins.
  const bankPatterns: ReadonlyArray<readonly [RegExp, string]> = [
    [/\bDBS\s*\/\s*POSB\b/i, 'DBS/POSB'],
    [/\bStandard\s+Chartered\b/i, 'Standard Chartered'],
    [/\bMaybank\b/i, 'Maybank'],
    [/\bCitibank\b|\bCiti\b/i, 'Citibank'],
    [/\bHSBC\b/i, 'HSBC'],
    [/\bOCBC\b/i, 'OCBC'],
    [/\bUOB\b/i, 'UOB'],
    [/\bPOSB\b/i, 'POSB'],
    [/\bDBS\b/i, 'DBS'],
  ]
  let bank: string | null = null
  for (const [re, name] of bankPatterns) {
    if (re.test(text)) {
      bank = name
      break
    }
  }

  // Type heuristic — credit card statements universally include "credit
  // limit" + "minimum payment"; investment statements lean on "market
  // value" / "unit trusts". Default to debit for everything else.
  let statementType: ParsedStatementType = 'debit'
  if (/CREDIT\s+LIMIT/i.test(text) && /MINIMUM\s+PAYMENT/i.test(text)) {
    statementType = 'credit'
  } else if (/Unit\s+Trusts|Market\s+Value/i.test(text) && !/Deposit|Savings|Multiplier/i.test(text)) {
    statementType = 'investment'
  }

  return {
    bank,
    statementType,
    periodStart,
    periodEnd,
    accountLast4: extractCardLast4(text),
    currency: extractCurrency(text),
    // Generic profile makes no reconciliation claim. Specific profiles
    // surface totals; everything else gets a "not reconcilable" badge in
    // the review UI.
    expectedTotal: null,
    expectedTotalKind: null,
    previousBalance: null,
  }
}

export function extractStatementMetadata(
  text: string,
  profile: StatementProfile,
): StatementMetadata {
  if (profile === ALTITUDE_PROFILE) return extractAltitudeMetadata(text)
  if (profile === DBS_PROFILE) return extractDbsDepositMetadata(text)
  return extractGenericMetadata(text)
}

/**
 * Resolves the canonical year for a transaction whose source date carries
 * day + month but no year. Uses the statement period as the anchor:
 *   - If both periodStart and periodEnd are known, pick the candidate
 *     year (period_end.year - 1, period_end.year, period_end.year + 1)
 *     whose resulting date sits inside or closest to that window.
 *   - If only one boundary is known, anchor on that.
 *   - Falls back to the supplied `fallbackYear` (typically the inferred
 *     year from `extract-tables`) if no boundary is available.
 *
 * Designed to fix the cross-year credit-card case: a statement closing on
 * 30 Dec 2025 with a "26 JAN" follow-on transaction must resolve to Jan
 * 2026, not Jan 2025.
 */
export function resolveTransactionYear(
  day: number,
  month: number,
  options: {
    periodStart?: string | null
    periodEnd?: string | null
    fallbackYear?: number
  },
): number | null {
  const { periodStart, periodEnd, fallbackYear } = options

  const startParsed = periodStart ? parseDateLoose(periodStart) : null
  const endParsed = periodEnd ? parseDateLoose(periodEnd) : null

  const anchor = endParsed ?? startParsed
  if (!anchor) return fallbackYear ?? null

  const candidates = [anchor.year - 1, anchor.year, anchor.year + 1]
  const startMs = startParsed ? Date.UTC(startParsed.year, startParsed.month - 1, startParsed.day) : null
  const endMs = endParsed ? Date.UTC(endParsed.year, endParsed.month - 1, endParsed.day) : null
  const anchorMs = Date.UTC(anchor.year, anchor.month - 1, anchor.day)

  // Allow a small grace window so transactions a few days outside the
  // period still resolve cleanly (credit cards routinely include trailing
  // posts after the statement date).
  const GRACE_MS = 45 * 24 * 60 * 60 * 1000

  type Scored = { year: number; inWindow: boolean; distance: number }
  const scored: Scored[] = candidates.map((year) => {
    const txMs = Date.UTC(year, month - 1, day)
    let distance = Math.abs(txMs - anchorMs)
    let inWindow = false
    if (startMs !== null && endMs !== null) {
      inWindow = txMs >= startMs - GRACE_MS && txMs <= endMs + GRACE_MS
    } else {
      inWindow = distance <= GRACE_MS
    }
    return { year, inWindow, distance }
  })

  // Prefer in-window years; among those, the closest to the anchor.
  scored.sort((a, b) => {
    if (a.inWindow !== b.inWindow) return a.inWindow ? -1 : 1
    return a.distance - b.distance
  })

  return scored[0].year
}

// Re-export profile constants so callers don't have to import from two
// places when wiring metadata into the ingest pipeline.
export { ALTITUDE_PROFILE, DBS_PROFILE, GENERIC_PROFILE }
