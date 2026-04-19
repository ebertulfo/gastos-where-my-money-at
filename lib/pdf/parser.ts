/**
 * Layout-aware transaction parser — TypeScript port of the generic parser in
 * src/parser.py (~750 LOC). Works off word coordinates from pdfjs-dist so
 * dates are matched at the row-start cell and column semantics (DBS
 * Withdrawal/Deposit/Balance) are derived from real x-positions instead of
 * character offsets in flat text.
 *
 * Design notes:
 * - Rejected rows are first-class output: every drop is logged via _reject()
 *   and exposed as `lastRejections` for spreadsheet/UI audit.
 * - Profiles (generic, altitude_credit_card, dbs_deposit_investment) tweak
 *   sign handling and column-x-band classification.
 * - Amounts are stored as plain `number` (JS double) — precision is safe at
 *   two decimal places for any realistic statement amount.
 */

import {
  groupWordsIntoLines,
  normalizeWhitespace,
} from "./lines";
import type { TextLine, Transaction } from "./models";
import type { Word } from "./words";
import {
  ACCOUNT_OVERVIEW,
  INVESTMENT_SECTION,
  SUMMARY_SECTION,
  TRANSACTION_SECTION,
  UNKNOWN_SECTION,
  type SectionLabel,
  classifySectionMarker,
  contentRejectionReason,
  sectionRejectionReason,
  CONTINUATION_NOISE_MARKERS,
} from "./sections";
import {
  ALTITUDE_PROFILE,
  DBS_PROFILE,
  GENERIC_PROFILE,
  selectProfile,
  type StatementProfile,
} from "./profiles";

/* ---------- regex ---------- */

const MONTH_NAMES =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

const DATE_SOURCE =
  `(?<date>` +
  `\\d{1,2}[\\/-]\\d{1,2}(?:[\\/-]\\d{2,4})?` +
  `|\\d{1,2}\\s+${MONTH_NAMES}(?:\\s+\\d{2,4})?` +
  `|${MONTH_NAMES}\\s+\\d{1,2}(?:,?\\s+\\d{2,4})?` +
  `)`;

// Matches an amount token like "1,234.56", "(1,234.56)", "-1234.56", "123.45-",
// optionally preceded by currency/label and followed by CR/DR.
const AMOUNT_SOURCE =
  "(?<label>\\b(?:debit|credit|withdrawal|deposit|payment|balance)\\b\\s*)?" +
  "(?<currency>S\\$|US\\$|A\\$|NZ\\$|HK\\$|RM|SGD|USD|EUR|GBP|AUD|CAD|JPY|\\$)?\\s*" +
  "(?<number>[-+]?\\(?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})\\)?-?|[-+]?\\(?\\d+\\.\\d{2}\\)?-?)" +
  "\\s*(?<suffix>CR|DR|CREDIT|DEBIT)?(?=\\s|$|[|,;])";

const HEADER_FOOTER_PATTERN =
  /\b(?:date|description|transaction|amount|balance|page|statement|account|total|opening|closing|previous|new balance)\b/i;

const SUMMARY_NOISE_PATTERN =
  /\b(?:statement date|payment due date|minimum payment|credit limit|available credit|available balance|previous balance|new balance|closing balance|opening balance|total amount due|amount due|past due|points earned|rewards|annual fee waiver|cash advance limit|instalment plans summary|balance carried forward|plan principal amt|instalment mths|outstanding amt)\b/i;

const NUMERIC_DATE_CELL_PATTERN = /^\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?$/;

const MONTH_LOOKUP = new Set([
  "jan", "january", "feb", "february", "mar", "march", "apr", "april", "may",
  "jun", "june", "jul", "july", "aug", "august", "sep", "sept", "september",
  "oct", "october", "nov", "november", "dec", "december",
]);

/* ---------- types ---------- */

export type DateSpan = {
  text: string;
  start: number;
  end: number;
};

export type AmountMatch = {
  /** Full matched token, e.g. "SGD 1,234.56 CR". */
  match: string;
  /** Index of the match in the source line. */
  start: number;
  end: number;
  number: string;
  suffix: string;
  label: string;
  currency: string;
};

export type ParseInput = {
  sourceFile: string;
  statementName: string;
  pageNumber: number;
  extractionMethod: "text" | "ocr";
};

export type ParseOutput = {
  transactions: Transaction[];
  rejections: Array<{ reason: string; rawLine: string }>;
};

/* ---------- amount parsing ---------- */

const AMOUNT_CLEAN_RE = /[^0-9.\-]/g;

export function parseAmountText(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const isNegative =
    trimmed.startsWith("-") ||
    trimmed.endsWith("-") ||
    (trimmed.includes("(") && trimmed.includes(")"));

  let cleaned = trimmed.replace(/,/g, "").replace(AMOUNT_CLEAN_RE, "");
  while (cleaned.startsWith("-")) cleaned = cleaned.slice(1);
  while (cleaned.endsWith("-")) cleaned = cleaned.slice(0, -1);
  if (!cleaned || cleaned === ".") return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return isNegative ? -value : value;
}

/* ---------- match helpers ---------- */

function findAllAmountMatches(text: string): AmountMatch[] {
  const matches: AmountMatch[] = [];
  const re = new RegExp(AMOUNT_SOURCE, "gi");
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    const groups = (m.groups ?? {}) as Record<string, string | undefined>;
    matches.push({
      match: m[0],
      start: m.index,
      end: m.index + m[0].length,
      number: groups.number ?? "",
      suffix: (groups.suffix ?? "").toUpperCase(),
      label: (groups.label ?? "").trim().toLowerCase(),
      currency: (groups.currency ?? "").toUpperCase(),
    });
  }
  return matches;
}

function countDateOccurrences(text: string): number {
  let count = 0;
  const re = new RegExp(DATE_SOURCE, "gi");
  for (const _ of text.matchAll(re)) count += 1;
  return count;
}

function hasAnyDate(text: string): boolean {
  return new RegExp(DATE_SOURCE, "i").test(text);
}

function decimalFromAmountMatch(m: AmountMatch | null): number | null {
  if (!m) return null;
  const value = parseAmountText(m.number);
  if (value === null) return null;
  if ((m.suffix === "DR" || m.suffix === "DEBIT") && value > 0) return -value;
  return value;
}

function hasExplicitNegativeMarker(m: AmountMatch): boolean {
  const n = m.number ?? "";
  return n.startsWith("-") || n.endsWith("-") || (n.includes("(") && n.includes(")"));
}

function isDayToken(token: string): boolean {
  if (!/^\d+$/.test(token)) return false;
  const v = Number(token);
  return v >= 1 && v <= 31;
}

function isMonthToken(token: string): boolean {
  return MONTH_LOOKUP.has(token.toLowerCase().replace(/[.,]/g, ""));
}

function isFourDigitYear(token: string): boolean {
  if (!/^\d{4}$/.test(token)) return false;
  const v = Number(token);
  return v >= 1900 && v <= 2099;
}

function stripEdgePunct(token: string): string {
  return token.replace(/^[,;]+|[,;]+$/g, "");
}

/* ---------- date cell detection ---------- */

function findRowStartDate(text: string): DateSpan | null {
  // Skip leading whitespace and bullet characters to mirror the Python impl.
  let idx = 0;
  while (idx < text.length && /\s/.test(text[idx])) idx++;
  while (idx < text.length && (text[idx] === "•" || text[idx] === "*")) {
    idx++;
    while (idx < text.length && /\s/.test(text[idx])) idx++;
  }
  const stripped = text.slice(idx);

  const tokenSpans: Array<{ raw: string; start: number; end: number }> = [];
  for (const m of stripped.matchAll(/\S+/g)) {
    if (m.index === undefined) continue;
    tokenSpans.push({ raw: m[0], start: m.index, end: m.index + m[0].length });
    if (tokenSpans.length >= 4) break;
  }
  if (tokenSpans.length === 0) return null;

  const first = stripEdgePunct(tokenSpans[0].raw);
  const firstStart = idx + tokenSpans[0].start;
  if (NUMERIC_DATE_CELL_PATTERN.test(first)) {
    return { text: first, start: firstStart, end: firstStart + first.length };
  }

  if (tokenSpans.length < 2) return null;
  const second = stripEdgePunct(tokenSpans[1].raw);

  function buildSpan(
    token0: { start: number; end: number },
    tokenLast: { start: number; end: number }
  ): DateSpan {
    const absStart = idx + token0.start;
    const absEnd = idx + tokenLast.end;
    const dateText = normalizeWhitespace(stripped.slice(token0.start, tokenLast.end));
    return { text: dateText, start: absStart, end: absEnd };
  }

  if (isDayToken(first) && isMonthToken(second)) {
    let last = tokenSpans[1];
    if (tokenSpans.length >= 3) {
      const third = stripEdgePunct(tokenSpans[2].raw);
      if (isFourDigitYear(third)) last = tokenSpans[2];
    }
    return buildSpan(tokenSpans[0], last);
  }

  if (isMonthToken(first) && isDayToken(second)) {
    let last = tokenSpans[1];
    if (tokenSpans.length >= 3) {
      const third = stripEdgePunct(tokenSpans[2].raw);
      if (isFourDigitYear(third)) last = tokenSpans[2];
    }
    return buildSpan(tokenSpans[0], last);
  }

  return null;
}

function findTransactionDate(text: string, profile: StatementProfile): DateSpan | null {
  if (profile.dateFirstRows) return findRowStartDate(text);
  return null;
}

/* ---------- parser class ---------- */

export class GenericTransactionParser {
  yTolerance: number;
  maxContinuationLines: number;
  rejectionCounts: Record<string, number> = {};
  lastRejections: Array<{ reason: string; rawLine: string }> = [];

  constructor(yTolerance = 3.0, maxContinuationLines = 1) {
    this.yTolerance = yTolerance;
    this.maxContinuationLines = maxContinuationLines;
  }

  linesFromWords(words: Word[]): TextLine[] {
    return groupWordsIntoLines(words, this.yTolerance);
  }

  parseWords(words: Word[], input: ParseInput): ParseOutput {
    return this.parseLines(this.linesFromWords(words), input);
  }

  parseLines(lines: TextLine[], input: ParseInput): ParseOutput {
    this.rejectionCounts = {};
    this.lastRejections = [];

    const transactions: Transaction[] = [];
    let continuationCount = 0;
    const profile = selectProfile(input.sourceFile, input.statementName, lines);
    let currentSection: SectionLabel = UNKNOWN_SECTION;

    for (const line of lines) {
      const text = normalizeWhitespace(line.text);
      const marker = classifySectionMarker(text, profile);
      if (marker !== null) {
        currentSection = marker;
        if (this._isPureSectionHeading(text)) {
          continuationCount = 0;
          continue;
        }
      }

      const section = marker ?? currentSection;
      const parsed = this._parseTransactionLine(line, input, section, profile);
      if (parsed !== null) {
        transactions.push(parsed);
        continuationCount = 0;
        continue;
      }

      if (
        (section === UNKNOWN_SECTION || section === TRANSACTION_SECTION) &&
        transactions.length > 0 &&
        continuationCount < this.maxContinuationLines &&
        this._isContinuationLine(line, transactions[transactions.length - 1])
      ) {
        const prev = transactions[transactions.length - 1];
        transactions[transactions.length - 1] = this._appendContinuation(prev, line.text);
        continuationCount += 1;
      } else {
        continuationCount = 0;
      }
    }

    return { transactions, rejections: [...this.lastRejections] };
  }

  /**
   * Filter for the spreadsheet/UI surface: only rejected rows that *look*
   * financial are worth showing to users.
   */
  isReviewableRejection(reason: string, rawText: string): boolean {
    const text = normalizeWhitespace(rawText);
    if (!text) return false;
    const amountCount = findAllAmountMatches(text).length;
    const hasAmount = amountCount > 0;
    const hasRowStart = findRowStartDate(text) !== null;
    const anyDate = hasAnyDate(text);

    if (reason === "embedded_date") return hasAmount;
    if (
      reason === ACCOUNT_OVERVIEW ||
      reason === INVESTMENT_SECTION ||
      reason === "balance_carried_forward"
    ) {
      return hasAmount || hasRowStart;
    }
    if (reason === SUMMARY_SECTION) return hasAmount && (hasRowStart || anyDate);
    return hasAmount && (hasRowStart || anyDate);
  }

  /* ---------- private ---------- */

  private _reject(text: string, reason: string): null {
    this.rejectionCounts[reason] = (this.rejectionCounts[reason] ?? 0) + 1;
    this.lastRejections.push({ reason, rawLine: text });
    return null;
  }

  private _isPureSectionHeading(text: string): boolean {
    if (!text) return true;
    if (findAllAmountMatches(text).length > 0) return false;
    if (findRowStartDate(text) !== null) return false;
    return true;
  }

  private _parseTransactionLine(
    line: TextLine,
    input: ParseInput,
    section: SectionLabel,
    profile: StatementProfile
  ): Transaction | null {
    const text = normalizeWhitespace(line.text);
    if (!text) return null;

    const contentRejection = contentRejectionReason(text);
    if (contentRejection !== null) {
      if (findTransactionDate(text, profile) === null && hasAnyDate(text)) {
        this._reject(text, "embedded_date");
      }
      return this._reject(text, contentRejection);
    }

    const sectionRej = sectionRejectionReason(section);
    if (sectionRej !== null) return this._reject(text, sectionRej);

    if (this._looksLikeHeaderOrFooter(text) || SUMMARY_NOISE_PATTERN.test(text)) {
      return this._reject(text, SUMMARY_SECTION);
    }

    const dateSpan = findTransactionDate(text, profile);
    if (dateSpan === null) {
      if (hasAnyDate(text)) return this._reject(text, "embedded_date");
      return null;
    }

    let amountMatches = findAllAmountMatches(text);
    amountMatches = amountMatches.filter((m) => decimalFromAmountMatch(m) !== null);
    if (amountMatches.length === 0) return null;

    if (this._looksLikeAmountSummaryLine(text, dateSpan, amountMatches)) {
      return this._reject(text, SUMMARY_SECTION);
    }

    const { amountMatch, balanceMatch, columnSide } =
      this._chooseAmountBalanceAndSide(line, amountMatches, profile);
    let amount = decimalFromAmountMatch(amountMatch);
    if (amount === null) return null;

    const runningBalance = balanceMatch ? decimalFromAmountMatch(balanceMatch) : null;
    const currency = this._detectCurrency(amountMatch, amountMatches);
    let debitCredit: "" | "debit" | "credit" =
      columnSide !== "" ? columnSide : this._inferDebitCredit(text, amountMatch, amount);
    const normalized = this._normalizeAmountForProfile(amount, debitCredit, amountMatch, profile);
    amount = normalized.amount;
    debitCredit = normalized.debitCredit;

    let description = this._extractDescription(text, dateSpan, amountMatch);
    if (!description) description = "[description not detected]";

    return {
      sourceFile: input.sourceFile,
      statementName: input.statementName,
      pageNumber: input.pageNumber,
      transactionDate: dateSpan.text,
      description,
      amount,
      currency,
      debitCredit,
      runningBalance,
      extractionMethod: input.extractionMethod,
      rawLine: text,
    };
  }

  private _looksLikeAmountSummaryLine(
    text: string,
    dateSpan: DateSpan,
    amounts: AmountMatch[]
  ): boolean {
    const between = normalizeWhitespace(text.slice(dateSpan.end, amounts[0].start));
    const dateCount = countDateOccurrences(text);
    if (!between && (amounts.length >= 2 || dateCount >= 2)) return true;
    return false;
  }

  private _chooseAmountBalanceAndSide(
    line: TextLine,
    matches: AmountMatch[],
    profile: StatementProfile
  ): {
    amountMatch: AmountMatch;
    balanceMatch: AmountMatch | null;
    columnSide: "" | "debit" | "credit";
  } {
    if (profile === DBS_PROFILE) {
      const dbs = this._chooseDbsAmountBalanceAndSide(line, matches);
      if (dbs !== null) return dbs;
    }
    const { amountMatch, balanceMatch } = this._chooseAmountAndBalance(matches);
    return { amountMatch, balanceMatch, columnSide: "" };
  }

  private _chooseDbsAmountBalanceAndSide(
    line: TextLine,
    matches: AmountMatch[]
  ): {
    amountMatch: AmountMatch;
    balanceMatch: AmountMatch | null;
    columnSide: "" | "debit" | "credit";
  } | null {
    const amountWords = this._amountWordsForLine(line);
    if (amountWords.length === 0 || amountWords.length !== matches.length) return null;

    // DBS/POSB ATM bands: balance x-center >= 490, deposit >= 410, else debit.
    type Classified = { match: AmountMatch; column: "balance" | "credit" | "debit" };
    const classified: Classified[] = matches.map((match, i) => {
      const { x0, x1 } = amountWords[i];
      const center = (x0 + x1) / 2;
      let column: Classified["column"];
      if (center >= 490) column = "balance";
      else if (center >= 410) column = "credit";
      else column = "debit";
      return { match, column };
    });

    let balanceMatch: AmountMatch | null = null;
    const txCandidates: Array<{ match: AmountMatch; column: "debit" | "credit" }> = [];
    for (const c of classified) {
      if (c.column === "balance") balanceMatch = c.match;
      else txCandidates.push({ match: c.match, column: c.column });
    }

    if (txCandidates.length > 0) {
      const last = txCandidates[txCandidates.length - 1];
      return { amountMatch: last.match, balanceMatch, columnSide: last.column };
    }
    if (matches.length >= 2) {
      return {
        amountMatch: matches[matches.length - 2],
        balanceMatch: matches[matches.length - 1],
        columnSide: "",
      };
    }
    return { amountMatch: matches[matches.length - 1], balanceMatch: null, columnSide: "" };
  }

  private _amountWordsForLine(line: TextLine): Array<{ text: string; x0: number; x1: number }> {
    const out: Array<{ text: string; x0: number; x1: number }> = [];
    const anchored = new RegExp(`^(?:${AMOUNT_SOURCE})$`, "i");
    for (const word of line.words) {
      const raw = (word.text ?? "").trim();
      if (!raw) continue;
      if (anchored.test(raw) && parseAmountText(raw) !== null) {
        out.push({ text: raw, x0: word.x0, x1: word.x1 });
      }
    }
    return out;
  }

  private _chooseAmountAndBalance(
    matches: AmountMatch[]
  ): { amountMatch: AmountMatch; balanceMatch: AmountMatch | null } {
    if (matches.length >= 2) {
      return { amountMatch: matches[matches.length - 2], balanceMatch: matches[matches.length - 1] };
    }
    return { amountMatch: matches[matches.length - 1], balanceMatch: null };
  }

  private _extractDescription(text: string, dateSpan: DateSpan, amountMatch: AmountMatch): string {
    // Skip a second adjacent date (transaction date + posting date layouts).
    let start = dateSpan.end;
    const tail = text.slice(start);
    const tailLstripped = tail.replace(/^\s+/, "");
    const skippedPrefixLen = tail.length - tailLstripped.length;
    const secondDate = findRowStartDate(tailLstripped);
    if (secondDate !== null) start = start + skippedPrefixLen + secondDate.end;

    const description = text.slice(start, amountMatch.start);
    return normalizeWhitespace(description.replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, ""));
  }

  private _detectCurrency(primary: AmountMatch, all: AmountMatch[]): string {
    if (primary.currency) return primary.currency;
    for (const m of all) {
      if (m.currency) return m.currency;
    }
    return "";
  }

  private _inferDebitCredit(text: string, m: AmountMatch, amount: number): "" | "debit" | "credit" {
    const suffix = m.suffix;
    const label = m.label;
    const ctxStart = Math.max(0, m.start - 18);
    const ctxEnd = Math.min(text.length, m.end + 18);
    const context = text.slice(ctxStart, ctxEnd).toLowerCase();

    if (suffix === "CR" || suffix === "CREDIT") return "credit";
    if (suffix === "DR" || suffix === "DEBIT") return "debit";
    if (amount < 0 || hasExplicitNegativeMarker(m)) return "debit";
    if (label === "debit" || label === "withdrawal" || label === "payment") return "debit";
    if (/\b(?:debit|withdrawal)\b/.test(context)) return "debit";
    if (label === "credit" || label === "deposit") return "credit";
    if (/\b(?:credit|deposit)\b/.test(context)) return "credit";
    return "";
  }

  private _normalizeAmountForProfile(
    amount: number,
    debitCredit: "" | "debit" | "credit",
    m: AmountMatch,
    profile: StatementProfile
  ): { amount: number; debitCredit: "" | "debit" | "credit" } {
    if (debitCredit === "debit" && amount > 0 && hasExplicitNegativeMarker(m)) {
      return { amount: -amount, debitCredit };
    }

    if (profile === ALTITUDE_PROFILE) {
      if (debitCredit === "credit" && amount > 0) return { amount: -amount, debitCredit };
      if (!debitCredit) return { amount, debitCredit: "debit" };
    }

    if (profile === DBS_PROFILE) {
      if (debitCredit === "debit" && amount > 0) return { amount: -amount, debitCredit };
      if (debitCredit === "credit" && amount < 0) return { amount: -amount, debitCredit };
    }

    return { amount, debitCredit };
  }

  private _looksLikeHeaderOrFooter(text: string): boolean {
    const lower = text.toLowerCase();
    if (text.length < 6) return true;
    if (HEADER_FOOTER_PATTERN.test(text) && findAllAmountMatches(text).length === 0) return true;
    if (
      lower.startsWith("date ") ||
      lower.startsWith("transaction date") ||
      lower.startsWith("statement period") ||
      lower.startsWith("page ")
    ) {
      return true;
    }
    return false;
  }

  private _isContinuationLine(line: TextLine, previous: Transaction): boolean {
    const text = normalizeWhitespace(line.text);
    if (!text || text.length < 4 || text.length > 120) return false;
    if (findRowStartDate(text) !== null || findAllAmountMatches(text).length > 0) return false;
    if (HEADER_FOOTER_PATTERN.test(text) || SUMMARY_NOISE_PATTERN.test(text)) return false;
    if (text.toLowerCase().startsWith("pds_")) return false;
    const lower = text.toLowerCase();
    if (
      lower.startsWith("page ") ||
      lower.startsWith("total") ||
      lower.startsWith("balance") ||
      lower.startsWith("statement")
    ) {
      return false;
    }
    if (this._looksLikeContinuationNoise(text)) return false;
    return line.x0 > 40 || /[-/,]$/.test(previous.description);
  }

  private _looksLikeContinuationNoise(text: string): boolean {
    const lower = text.toLowerCase();
    if (lower.startsWith("pds_") || lower.includes("_estmt_") || lower.includes("_onsh_")) return true;
    const tokens = text.split(/\s+/).filter(Boolean);
    const digitCount = tokens.filter((t) => /\d/.test(t)).length;
    if (digitCount >= 3 && digitCount >= Math.max(1, Math.floor(tokens.length / 2))) return true;
    for (const marker of CONTINUATION_NOISE_MARKERS) {
      if (lower.includes(marker)) return true;
    }
    return false;
  }

  private _appendContinuation(tx: Transaction, continuation: string): Transaction {
    const c = normalizeWhitespace(continuation);
    return {
      ...tx,
      description: normalizeWhitespace(`${tx.description} ${c}`),
      rawLine: normalizeWhitespace(`${tx.rawLine} || ${c}`),
    };
  }
}

/* ---------- exports re-used by extractor ---------- */

export { findRowStartDate, findTransactionDate, findAllAmountMatches };
export { GENERIC_PROFILE, DBS_PROFILE, ALTITUDE_PROFILE };
