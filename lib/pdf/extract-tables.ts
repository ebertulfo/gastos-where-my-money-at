/**
 * Orchestration layer: PDF buffer → ParsedTable[].
 *
 * Pipeline:
 *   pdfjs-dist → extractPageWords → groupWordsIntoLines → GenericTransactionParser
 *
 * The public surface (`extractTablesFromPdf`, `UnsupportedPdfError`) is
 * identical to the previous pdf-parse-based implementation so callers in
 * `app/api/statements/parse/route.ts` and `app/api/statements/ingest/route.ts`
 * don't change.
 *
 * Row shape for each ParsedTable is `[Date, Description, Amount, Balance, Identifier]`,
 * matching what ingest expects at row[0]..row[3]. Amount is emitted SIGNED for
 * credit-card statements (credits as negative, e.g. "-25.45") so sums reconcile
 * with statement totals. Bank statements emit withdrawals only, with positive
 * amounts (matching the previous extractor's behaviour).
 */

import { generateTransactionIdentifier } from "../transaction-identifier";
import {
  extractPageWords,
  type PageWords,
} from "./words";
import { groupWordsIntoLines } from "./lines";
import {
  GenericTransactionParser,
  ALTITUDE_PROFILE,
  DBS_PROFILE,
  GENERIC_PROFILE,
} from "./parser";
import { selectProfile } from "./profiles";
import type { ParsedTable } from "./types";
import { sanitizeDescription } from "./types";
import type { RejectedRow, Transaction } from "./models";

/** Minimum combined text length to consider a PDF text-based (not scanned). */
const MIN_TEXT_LENGTH = 50;

export class UnsupportedPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedPdfError";
  }
}

export type ExtractResult = {
  tables: ParsedTable[];
  rejectedRows: RejectedRow[];
};

export async function extractTablesFromPdf(buffer: Buffer): Promise<ParsedTable[]> {
  const { tables } = await extractTablesAndRejections(buffer);
  return tables;
}

/**
 * Full extraction result including reviewable rejections. Kept separate so
 * the existing `extractTablesFromPdf` signature is preserved for callers
 * that don't yet care about rejections.
 */
export async function extractTablesAndRejections(buffer: Buffer): Promise<ExtractResult> {
  let pages: PageWords[];
  try {
    pages = await extractPageWords(buffer);
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`);
  }

  const combinedText = pages.map((p) => p.text).join("\n");
  if (!combinedText || combinedText.length < MIN_TEXT_LENGTH) {
    throw new UnsupportedPdfError(
      "No tabular data found. We only support text-based, tabular statements right now."
    );
  }

  const defaultYear = inferDefaultYearFromText(combinedText);

  // Fake source-file hints: the API receives a Buffer with no filename, so
  // profile selection falls back to page-heading detection. That's the same
  // behaviour the Python pipeline has when run against unnamed streams.
  const sourceFile = "";
  const statementName = "";

  const parser = new GenericTransactionParser();
  const allTransactions: Transaction[] = [];
  const allRejections: RejectedRow[] = [];

  let profile = GENERIC_PROFILE;
  for (const page of pages) {
    const lines = groupWordsIntoLines(page.words, 3.0);
    // Profile detection uses early lines; pick it up from the first page with content.
    if (profile === GENERIC_PROFILE && lines.length > 0) {
      profile = selectProfile(sourceFile, statementName, lines);
    }

    const { transactions, rejections } = parser.parseLines(lines, {
      sourceFile,
      statementName,
      pageNumber: page.pageNumber,
      extractionMethod: "text",
    });

    allTransactions.push(...transactions);

    for (const r of rejections) {
      if (!parser.isReviewableRejection(r.reason, r.rawLine)) continue;
      allRejections.push({
        sourceFile,
        statementName,
        pageNumber: page.pageNumber,
        rejectionReason: r.reason,
        rawLine: r.rawLine,
        extractionMethod: "text",
      });
    }
  }

  if (allTransactions.length === 0) {
    throw new UnsupportedPdfError(
      "No transactions could be extracted from this statement."
    );
  }

  const isCreditCard = profile === ALTITUDE_PROFILE;
  const isBank = profile === DBS_PROFILE;

  const rows: string[][] = [];
  for (const tx of allTransactions) {
    if (isBank) {
      // Bank statements: surface only debits (withdrawals) to preserve the
      // existing ingest contract.
      if (tx.debitCredit !== "debit") continue;
      rows.push([
        tx.transactionDate,
        sanitizeDescription(tx.description),
        Math.abs(tx.amount).toFixed(2),
        tx.runningBalance != null ? tx.runningBalance.toFixed(2) : "",
      ]);
    } else if (isCreditCard) {
      // Credit cards: emit all rows, signed so credits reduce the total.
      rows.push([
        tx.transactionDate,
        sanitizeDescription(tx.description),
        tx.amount.toFixed(2),
        "",
      ]);
    } else {
      // Generic fallback: preserve absolute amount to match previous behaviour.
      rows.push([
        tx.transactionDate,
        sanitizeDescription(tx.description),
        Math.abs(tx.amount).toFixed(2),
        tx.runningBalance != null ? tx.runningBalance.toFixed(2) : "",
      ]);
    }
  }

  const rowsWithIds = appendIdentifiers(rows, {
    defaultYear,
    balanceFallback: "0.00",
  });

  const headers = ["Date", "Description", "Amount", "Balance", "Identifier"];

  const table: ParsedTable = {
    page: 1,
    headers,
    rows: rowsWithIds,
    metadata: {
      inferredYear: defaultYear,
    },
  };

  return { tables: [table], rejectedRows: allRejections };
}

/* ---------- preserved helpers from the previous implementation ---------- */

function inferDefaultYearFromText(text: string): number | undefined {
  const yearCandidates = new Set<number>();
  const currentYear = new Date().getFullYear();

  const statementDatePattern =
    /(?:statement|bill)?\s*date\s*[:.]?\s*(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\w*\s+(?:20\d{2}|19\d{2}))/gi;
  for (const m of text.matchAll(statementDatePattern)) {
    const yearMatch = m[1].match(/(20\d{2}|19\d{2})/);
    if (yearMatch) yearCandidates.add(Number(yearMatch[1]));
  }

  const dmyPattern = /\b\d{1,2}[/-]\d{1,2}[/-](\d{2,4})\b/g;
  for (const m of text.matchAll(dmyPattern)) {
    const year = coerceYear(m[1]);
    if (year && year <= currentYear + 1) yearCandidates.add(year);
  }

  const ymdPattern = /\b(20\d{2}|19\d{2})[/-]\d{1,2}[/-]\d{1,2}\b/g;
  for (const m of text.matchAll(ymdPattern)) {
    const year = Number(m[1]);
    if (year <= currentYear + 1) yearCandidates.add(year);
  }

  const monthNamePattern =
    /\b\d{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\w*\s+(20\d{2}|19\d{2})\b/gi;
  for (const m of text.matchAll(monthNamePattern)) {
    const year = Number(m[2]);
    if (year <= currentYear + 1) yearCandidates.add(year);
  }

  if (yearCandidates.size === 0) return undefined;

  const explicitStatementYearRegex =
    /(?:statement|bill)\s*date\s*[:.]?\s*\d{1,2}\s+(?:[a-z]+)\s+(20\d{2})/i;
  const explicitMatch = text.match(explicitStatementYearRegex);
  if (explicitMatch) return Number(explicitMatch[1]);

  const years = Array.from(yearCandidates).sort();
  if (years.length > 1) return Math.min(...years);
  return years[0];
}

function coerceYear(yearStr: string): number | null {
  if (/^\d{4}$/.test(yearStr)) return Number(yearStr);
  if (/^\d{2}$/.test(yearStr)) return 2000 + Number(yearStr);
  return null;
}

function appendIdentifiers(
  rows: string[][],
  options: { defaultYear?: number; balanceFallback?: string }
): string[][] {
  const effectiveDefaultYear = options.defaultYear ?? new Date().getFullYear();
  return rows.map((row) => {
    const [date, description, amount, balanceRaw] = row;
    const resolvedBalance =
      (balanceRaw && balanceRaw.trim()) ||
      options.balanceFallback ||
      amount ||
      "0.00";

    const identifier = generateTransactionIdentifier({
      date,
      amount,
      balance: resolvedBalance,
      description,
      defaultYear: effectiveDefaultYear,
    });

    const normalizedBalance =
      balanceRaw && balanceRaw.trim() ? balanceRaw : resolvedBalance;

    return [date, description, amount, normalizedBalance, identifier];
  });
}
