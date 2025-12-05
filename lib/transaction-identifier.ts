import { createHash } from "crypto";

export type TransactionIdentifierInput = {
  /** Raw transaction date (e.g. "01/09/2024", "2024-09-01") */
  date: string;
  /** Transaction amount string (may contain commas) */
  amount: string;
  /** Resulting balance string after the transaction (may contain commas) */
  balance: string;
  /** Transaction description */
  description: string;
  /**
   * Optional default year to apply when date strings omit the year (e.g., "19 SEP").
   * Should be derived from statement metadata (statement period/start/end).
   */
  defaultYear?: number;
};

/**
 * Pads a number with a leading zero when needed to always get two digits.
 */
function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Normalizes a date string into `YYYYMMDD` format.
 *
+ * Supports:
 * - `YYYYMMDD`
 * - `YYYY-MM-DD` / `YYYY/MM/DD`
 * - `DD/MM/YYYY` / `DD-MM-YYYY`
 * - `DD MMM YYYY` (month name, case-insensitive)
 *
 * Throws if the date cannot be normalized (e.g., missing year).
 */
export function normalizeDateToYyyyMmDd(
  date: string,
  options?: { defaultYear?: number }
): string {
  const cleaned = date.trim().replace(/,/g, "").replace(/\s+/g, " ");

  // Already normalized: 20240901
  if (/^\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return validateAndFormatDate(year, month, day);
  }

  // DD/MM/YYYY or DD-MM-YYYY (or 2-digit year)
  const dmyMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = normalizeYear(dmyMatch[3]);
    return validateAndFormatDate(year, month, day);
  }

  // DD MMM YYYY (month name)
  const monthNameMatch = cleaned.match(
    /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})$/
  );
  if (monthNameMatch) {
    const day = Number(monthNameMatch[1]);
    const month = monthFromName(monthNameMatch[2]);
    const year = normalizeYear(monthNameMatch[3]);
    return validateAndFormatDate(year, month, day);
  }

  // DD MMM (no year) - only allowed if defaultYear is provided
  const monthNameNoYearMatch = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,})$/);
  if (monthNameNoYearMatch && options?.defaultYear) {
    const day = Number(monthNameNoYearMatch[1]);
    const month = monthFromName(monthNameNoYearMatch[2]);
    return validateAndFormatDate(options.defaultYear, month, day);
  }

  throw new Error(`Cannot normalize date "${date}" to YYYYMMDD format`);
}

/**
 * Removes commas, trims whitespace, and formats numeric strings to a fixed
 * two-decimal representation.
 */
export function normalizeAmount(value: string, field: "amount" | "balance"): string {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) {
    throw new Error(`${field} is required to generate a transaction identifier`);
  }

  const numericValue = Number(cleaned);
  if (Number.isNaN(numericValue)) {
    throw new Error(`${field} "${value}" is not a valid number`);
  }

  return numericValue.toFixed(2);
}

/**
 * Generates the transaction identifier following the format:
 * `<date>-<amount>-<balance>-<descriptionHash>`
 */
export function generateTransactionIdentifier({
  date,
  amount,
  balance,
  description,
  defaultYear,
}: TransactionIdentifierInput): string {
  const normalizedDate = normalizeDateToYyyyMmDd(date, {
    defaultYear,
  });
  const normalizedAmount = normalizeAmount(amount, "amount");
  const normalizedBalance = normalizeAmount(balance, "balance");
  const descriptionHash = createHash("sha256")
    .update(description.trim())
    .digest("hex")
    .slice(0, 8);

  return `${normalizedDate}-${normalizedAmount}-${normalizedBalance}-${descriptionHash}`;
}

function normalizeYear(yearStr: string): number {
  if (yearStr.length === 4) {
    return Number(yearStr);
  }

  if (yearStr.length === 2) {
    return 2000 + Number(yearStr);
  }

  throw new Error(`Invalid year value "${yearStr}"`);
}

function monthFromName(name: string): number {
  const lookup: Record<string, number> = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    SEPT: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };

  const upper = name.slice(0, 4).toUpperCase();
  const month = lookup[upper] ?? lookup[upper.slice(0, 3)];

  if (!month) {
    throw new Error(`Unknown month "${name}"`);
  }

  return month;
}

function validateAndFormatDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date ${year}-${month}-${day}`);
  }

  return `${year}${pad2(month)}${pad2(day)}`;
}
