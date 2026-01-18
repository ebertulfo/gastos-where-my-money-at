import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import type { ParsedTable } from "./types";
import { sanitizeDescription } from "./types";
import { generateTransactionIdentifier } from "../transaction-identifier";

/** Minimum text length to consider a PDF as text-based (not scanned) */
const MIN_TEXT_LENGTH = 50;

/** Minimum number of cells in a line to be considered table-like */
const MIN_CELLS_PER_LINE = 2;

/** Minimum number of rows required to form a valid table */
const MIN_ROWS_FOR_TABLE = 2;

/**
 * Custom error class for unsupported PDFs (scanned/image-based or no tables).
 */
export class UnsupportedPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedPdfError";
  }
}

interface PageData {
  num: number;
  text: string;
}

/**
 * Extracts all tables from a PDF buffer using heuristic-based text parsing.
 *
 * @param buffer - The PDF file as a Buffer
 * @returns Array of parsed tables
 * @throws UnsupportedPdfError if PDF is scanned/image-based or contains no tables
 */
export async function extractTablesFromPdf(
  buffer: Buffer
): Promise<ParsedTable[]> {
  const parser = new PDFParse({ data: buffer });

  try {
    // Extract text from PDF
    const textResult = await parser.getText();

    if (!textResult.text || textResult.text.length < MIN_TEXT_LENGTH) {
      throw new UnsupportedPdfError(
        "No tabular data found. We only support text-based, tabular statements right now."
      );
    }

    // Detect statement type based on content
    // Credit card detection: Look for specific credit card indicators
    // Must NOT have withdrawal/deposit column headers (which indicate bank statements)
    const hasBankColumns = /withdrawal.*deposit|deposit.*withdrawal|withdrawals\s+sgd|deposits\s+sgd/i.test(textResult.text);
    const hasCreditCardIndicators = /credit card|visa.*card|mastercard|minimum payment|previous balance|new transactions/i.test(textResult.text);

    // Bank statement: has withdrawal/deposit columns OR "balance brought forward" pattern
    const isBankStatement = hasBankColumns || /balance brought forward|balance b\/f/i.test(textResult.text);
    // Credit card: has credit card indicators AND does NOT have bank columns
    const isCreditCard = hasCreditCardIndicators && !hasBankColumns;
    // Infer a default year from statement text to handle date strings without a year (e.g., "19 SEP")
    const defaultYear = inferDefaultYearFromText(textResult.text);

    // Use page-level text extraction for better accuracy
    const allRows: string[][] = [];
    let firstHeader: string[] | null = null;

    for (const pageResult of textResult.pages) {
      const pageNumber = pageResult.num;
      const pageText = pageResult.text;

      // Use different extraction method based on statement type
      const pageTables = isCreditCard
        ? extractCreditCardTransactions(pageText, pageNumber)
        : extractTablesFromPageText(pageText, pageNumber);

      // Consolidate all tables into one
      for (const table of pageTables) {
        // Capture the first header we find
        if (!firstHeader && table.headers) {
          firstHeader = table.headers;
        }
        allRows.push(...table.rows);
      }
    }

    if (allRows.length === 0) {
      throw new UnsupportedPdfError(
        "No tabular data found. We only support text-based, tabular statements right now."
      );
    }

    // Filter rows based on statement type
    let filteredRows = allRows;
    let filteredHeaders = firstHeader;

    if (isBankStatement) {
      // parseMultiLineTransaction now returns:
      // [Date, Description, TransactionAmount, Balance]
      // Index: 0=Date, 1=Description, 2=TransactionAmount, 3=Balance
      const AMOUNT_IDX = 2;
      const BALANCE_IDX = 3;

      // Use balance comparison to determine withdrawals vs deposits
      // If balance decreased, it's a withdrawal; if increased, it's a deposit
      let previousBalance: number | null = null;
      const withdrawalRows: string[][] = [];

      for (const row of allRows) {
        const currentBalanceStr = row[BALANCE_IDX]?.replace(/,/g, '');
        const currentBalance = currentBalanceStr ? parseFloat(currentBalanceStr) : null;
        const amountStr = row[AMOUNT_IDX]?.replace(/,/g, '');
        const transactionAmt = amountStr ? parseFloat(amountStr) : null;

        // Skip balance-only rows (no transaction amount)
        if (!transactionAmt) {
          if (currentBalance !== null) {
            previousBalance = currentBalance;
          }
          continue;
        }

        // Determine if this is a withdrawal based on balance change
        if (previousBalance !== null && currentBalance !== null) {
          const balanceDiff = currentBalance - previousBalance;

          // Balance decreased = withdrawal (money went out)
          // We use a small threshold to handle floating point issues
          if (balanceDiff < -0.001) {
            // This is a withdrawal - include it
            // Sanitize description to remove sensitive patterns
            withdrawalRows.push([
              row[0], // Date
              sanitizeDescription(row[1]), // Description (sanitized)
              row[AMOUNT_IDX], // Amount
              row[BALANCE_IDX] || "", // Balance after transaction
            ]);
          }
          // If balanceDiff >= 0, it's a deposit - skip it
        }

        if (currentBalance !== null) {
          previousBalance = currentBalance;
        }
      }

      // Use the withdrawalRows we collected
      filteredRows = withdrawalRows;

      // Simplify headers: Date, Description, Amount
      filteredHeaders = ["Date", "Description", "Amount", "Balance"];
    } else if (isCreditCard) {
      // Credit card extraction already returns [Date, Description, Amount]
      // Just need to filter out any remaining non-transaction rows
      filteredRows = allRows
        .filter((row) => {
          const description = row[1]?.trim() || '';
          const amount = row[2]?.trim() || '';

          // Skip if no amount
          if (!amount || !/\d/.test(amount)) return false;

          // Skip rows with very long descriptions (likely preamble that slipped through)
          if (description.length > 150) return false;

          return true;
        })
        // Sanitize descriptions to remove sensitive patterns
        .map((row) => [
          row[0], // Date
          sanitizeDescription(row[1]), // Description (sanitized)
          row[2], // Amount
          "", // Balance not present on credit card statements (placeholder for ID format)
        ]);

      filteredHeaders = ["Date", "Description", "Amount", "Balance"];
    }

    // Append identifiers to every row
    const rowsWithIds = appendIdentifiers(filteredRows, {
      defaultYear,
      // Credit card statements often have no running balance; use 0.00 as placeholder to satisfy the identifier format.
      balanceFallback: "0.00",
    });
    const headersWithId = filteredHeaders ? [...filteredHeaders, "Identifier"] : null;

    // Return a single consolidated table
    const consolidatedTable: ParsedTable = {
      page: 1, // Represents "all pages"
      headers: headersWithId,
      rows: rowsWithIds,
      metadata: {
        inferredYear: defaultYear,
      },
    };

    return [consolidatedTable];
  } catch (error) {
    if (error instanceof UnsupportedPdfError) throw error;
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Date patterns for transaction line detection */
const DATE_PATTERNS = [
  /^\d{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i, // "29 AUG"
  /^\d{1,2}\/\d{1,2}\/\d{2,4}/, // "05/09/2024" or "05/09/24"
  /^\d{1,2}-\d{1,2}-\d{2,4}/, // "05-09-2024"
  /^\d{1,2}\s+\w{3}\s+\d{2,4}/, // "05 Sep 2024"
];

/**
 * Column position information extracted from header line.
 */
interface ColumnInfo {
  name: string;
  startPos: number;
  centerPos: number;
}

/**
 * Extracts column positions from a header line.
 * Returns array of column info with name and position.
 */
function extractHeaderColumnPositions(headerLine: string): ColumnInfo[] {
  const columns: ColumnInfo[] = [];

  // Split by 2+ spaces to find column headers
  const parts = headerLine.split(/(\s{2,})/);
  let pos = 0;

  for (const part of parts) {
    if (/\s{2,}/.test(part)) {
      pos += part.length;
    } else if (part.trim()) {
      const startPos = pos;
      const endPos = pos + part.length;
      columns.push({
        name: part.trim(),
        startPos,
        centerPos: (startPos + endPos) / 2
      });
      pos = endPos;
    }
  }

  return columns;
}

/**
 * Finds which column an amount belongs to based on its position.
 */
function findColumnForAmount(amountPos: number, columns: ColumnInfo[]): number {
  let bestIdx = -1;
  let bestDistance = Infinity;

  for (let i = 0; i < columns.length; i++) {
    const distance = Math.abs(amountPos - columns[i].centerPos);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Parses a transaction line using column positions from headers.
 * Returns array matching the column structure.
 */
function parseTransactionWithColumnPositions(
  lines: string[],
  columnPositions: ColumnInfo[]
): string[] | null {
  if (lines.length === 0 || columnPositions.length === 0) return null;

  const firstLine = lines[0];
  const trimmed = firstLine.trim();
  const date = extractDate(trimmed);
  if (!date) return null;

  // Initialize result array with empty strings for each column
  const result: string[] = new Array(columnPositions.length).fill('');

  // Find which column is which by name
  const dateColIdx = columnPositions.findIndex(c => /date/i.test(c.name));
  const descColIdx = columnPositions.findIndex(c => /description|particulars/i.test(c.name));
  const withdrawalColIdx = columnPositions.findIndex(c => /withdrawal|debit/i.test(c.name));
  const depositColIdx = columnPositions.findIndex(c => /deposit|credit/i.test(c.name));
  const balanceColIdx = columnPositions.findIndex(c => /balance/i.test(c.name));

  // Set date
  if (dateColIdx >= 0) result[dateColIdx] = date;

  // Collect description and amounts from all lines
  const descParts: string[] = [];

  for (const line of lines) {
    // Find all amounts and their positions in this line
    const amountPattern = /\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g;
    let match;

    while ((match = amountPattern.exec(line)) !== null) {
      const amount = match[1];
      const amountPos = match.index + amount.length / 2; // Center of amount

      // Find which column this amount belongs to
      const colIdx = findColumnForAmount(amountPos, columnPositions);

      // Only assign to withdrawal, deposit, or balance columns
      if (colIdx === withdrawalColIdx || colIdx === depositColIdx || colIdx === balanceColIdx) {
        result[colIdx] = amount;
      }
    }

    // Extract description text (non-amount parts)
    const textPart = line
      .replace(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g, '') // Remove amounts
      .trim();

    // For first line, remove the date
    if (line === lines[0] && date) {
      const withoutDate = textPart.replace(date, '').trim();
      if (withoutDate) descParts.push(withoutDate);
    } else if (textPart && !/^value\s+date/i.test(textPart)) {
      descParts.push(textPart);
    }
  }

  // Set description
  if (descColIdx >= 0) {
    result[descColIdx] = descParts.join(' ').trim();
  }

  return result;
}

/**
 * Checks if a line starts with a date pattern (indicates start of a transaction).
 */
function startsWithDate(line: string): boolean {
  const trimmed = line.trim();
  return DATE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Extracts the date from the beginning of a line.
 */
function extractDate(line: string): string | null {
  const trimmed = line.trim();
  for (const pattern of DATE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

/**
 * Extracts amounts from a line (numbers like 100.00 or 1,234.56).
 * Returns array of amount strings found.
 */
function extractAmounts(line: string): string[] {
  const amountPattern = /\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g;
  const matches = line.match(amountPattern);
  return matches || [];
}

/**
 * Extracts the amount from the "Amount" column position.
 * In credit card statements, the amount column is typically at the far right,
 * separated from the description by significant whitespace.
 * 
 * Returns the rightmost amount that appears to be in a column position,
 * or null if no valid column amount is found.
 */
function extractColumnAmount(line: string): string | null {
  // Look for amount at the end of line, possibly preceded by whitespace
  // Pattern: significant whitespace (2+) followed by amount at end
  const columnAmountPattern = /\s{2,}(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/;
  const match = line.match(columnAmountPattern);
  if (match) {
    return match[1];
  }

  // Fallback: if line ends with an amount (with possible single space)
  const endAmountPattern = /(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/;
  const endMatch = line.match(endAmountPattern);
  if (endMatch) {
    // Make sure this isn't an embedded amount (check if there's substantial text before it)
    const beforeAmount = line.slice(0, line.lastIndexOf(endMatch[1])).trim();
    // If there's text and it ends with whitespace, this is likely the column amount
    if (beforeAmount.length > 0) {
      return endMatch[1];
    }
  }

  return null;
}

/**
 * Extracts credit card transactions using a simpler approach.
 * Credit card statements typically have: Date, Description, Amount
 * Returns rows as [Date, Description, Amount]
 */
export function extractCreditCardTransactions(
  pageText: string,
  pageNumber: number
): ParsedTable[] {
  const lines = pageText.split(/\r?\n/);
  const rows: string[][] = [];

  let currentTransaction: { date: string; descParts: string[]; amount: string } | null = null;

  // New helper for foreign currency check
  const isForeignCurrencyLine = (line: string): boolean => {
    const currencyKeywords = /\b(YEN|PESO|USD|EUR|GBP|AUD|CAD|HKD|MYR|CNY|KRW|THB|IDR|VND|INR|CHF|NZD)\b/i;
    return currencyKeywords.test(line);
  };

  const flushTransaction = () => {
    if (currentTransaction) {
      // Fallback: If amount is missing, check if it was captured in the description
      if (!currentTransaction.amount && currentTransaction.descParts.length > 0) {
        const fullDesc = currentTransaction.descParts.join(' ');

        // Look for any amount-like pattern in the description
        // (Since we strip amounts from continuation lines, any remaining amount is likely the valid one from line 1)
        const amountMatch = fullDesc.match(/\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/);

        if (amountMatch) {
          currentTransaction.amount = amountMatch[1];
          // Remove it from description parts
          // Iterate and remove from the specific part it belongs to
          for (let i = 0; i < currentTransaction.descParts.length; i++) {
            if (currentTransaction.descParts[i].includes(currentTransaction.amount)) {
              currentTransaction.descParts[i] = currentTransaction.descParts[i]
                .replace(currentTransaction.amount, '')
                .trim();
              break;
            }
          }
        }
      }

      if (currentTransaction.amount) {
        const description = currentTransaction.descParts.join(' ').trim();
        // Only add if it looks like a real transaction
        if (description && !isNonTransactionLine(description)) {
          rows.push([currentTransaction.date, description, currentTransaction.amount]);
        }
      }
    }
    currentTransaction = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip summary and non-transaction lines
    if (isSummaryOrEndLine(trimmed) || isNonTransactionLine(trimmed)) {
      flushTransaction();
      continue;
    }

    // Check if line starts with a date
    const date = extractDate(trimmed);
    if (date) {
      // Flush previous transaction
      flushTransaction();

      // Extract the column amount (rightmost, separated by whitespace)
      // Use original line to preserve spacing for column detection
      const columnAmount = extractColumnAmount(line);

      // Get description: everything after date, excluding the column amount
      let descriptionPart = line.slice(line.toLowerCase().indexOf(date.toLowerCase()) + date.length).trim();
      if (columnAmount) {
        // Remove the column amount from description
        const amountIndex = descriptionPart.lastIndexOf(columnAmount);
        if (amountIndex > 0) {
          descriptionPart = descriptionPart.slice(0, amountIndex).trim();
        }
      }

      // Also remove any remaining amounts from description (embedded foreign currency amounts)
      descriptionPart = descriptionPart.replace(/\b\d{1,3}(?:,\d{3})*\.\d{2}\s*$/g, '').trim();

      currentTransaction = {
        date,
        descParts: descriptionPart ? [descriptionPart] : [],
        amount: columnAmount || ''
      };
    } else if (currentTransaction) {
      // Continuation line - check if it might contain the column amount
      // (PDF extraction sometimes puts amounts on separate lines)

      const isForeign = isForeignCurrencyLine(trimmed);

      // First, check if this line is JUST an amount (column amount on its own line)
      const justAmountMatch = trimmed.match(/^(\d{1,3}(?:,\d{3})*\.\d{2})$/);
      if (justAmountMatch && !currentTransaction.amount && !isForeign) {
        currentTransaction.amount = justAmountMatch[1];
        continue;
      }

      // Check for column amount at end of this line (if we don't have one)
      if (!currentTransaction.amount) {
        const lineColumnAmount = extractColumnAmount(line);
        if (lineColumnAmount && !isForeign) {
          currentTransaction.amount = lineColumnAmount;
          // Get the text part without the amount
          const textPart = trimmed.replace(/\s*\d{1,3}(?:,\d{3})*\.\d{2}\s*$/, '').trim();
          // Only add text if it's not just a currency label
          if (textPart && !/^[A-Z\.\s]+(DOLLAR|EURO|POUND|YEN|PESO)\s*$/i.test(textPart)) {
            // Remove any embedded amounts from text
            const cleanText = textPart.replace(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g, '').trim();
            if (cleanText) {
              currentTransaction.descParts.push(cleanText);
            }
          }
          continue;
        }
      }

      // Regular continuation line - add text to description, strip all amounts
      // (these are foreign currency amounts or other embedded numbers)
      const textPart = trimmed.replace(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g, '').trim();

      if (textPart) {
        currentTransaction.descParts.push(textPart);
      }
    }
  }

  // Flush last transaction
  flushTransaction();

  if (rows.length < MIN_ROWS_FOR_TABLE) {
    return [];
  }

  return [{
    page: pageNumber,
    headers: ['Date', 'Description', 'Amount'],
    rows
  }];
}

/**
 * Checks if a line looks like a header row.
 */
function isHeaderLine(line: string): boolean {
  const cells = line.trim().split(/\s{2,}/).filter(Boolean);
  if (cells.length < 2) return false;

  const headerKeywords = /^(date|description|withdrawal|deposit|balance|amount|debit|credit|transaction|particulars|reference)/i;
  return cells.every((cell) => /[A-Za-z]/.test(cell)) && headerKeywords.test(cells[0]);
}

/**
 * Checks if a line indicates end of transaction details or a summary row.
 * These lines should stop transaction extraction.
 */
function isSummaryOrEndLine(line: string): boolean {
  const summaryPatterns = [
    /^\s*total\b/i,                          // "Total" at start
    /\btotal\s*$/i,                           // "Total" at end
    /^-+\s*total\b/i,                        // "--- Total"
    /\bend\s+of\s+transaction/i,             // "End of Transaction"
    /\btotal\s+balance\b/i,                  // "Total Balance"
    /\bbalance\s+carried\s+forward\b/i,      // "Balance Carried Forward"
    /\bbalance\s+b\/?f\b.*total/i,           // "Balance B/F" with total
    /\binterest\s+credit\s+total\b/i,        // "Interest Credit Total"
    /\binterest\s+earned\b/i,                // "Interest Earned" (summary row)
    /\binterest\s+credit\b(?!.*fast)/i,      // "Interest Credit" but not "Inward Credit-FAST"
    /^-{3,}/,                                 // Lines starting with dashes (separators)
  ];
  return summaryPatterns.some(pattern => pattern.test(line));
}

/**
 * Checks if a line is a non-transaction line that should be skipped
 * (preamble, headers, card info, etc.)
 * 
 * NOTE: Balance B/F rows are NOT skipped here - they need to be parsed
 * to establish the initial balance for withdrawal/deposit detection.
 */
function isNonTransactionLine(line: string): boolean {
  const skipPatterns = [
    /\bprevious\s+balance\b/i,
    /\bnew\s+transactions\b/i,
    /\bstatement\s+date\b/i,
    /\bcredit\s+limit\b/i,
    /\bminimum\s+payment\b/i,
    /\bpayment\s+due\b/i,
    /\bplease\s+settle\b/i,
    /\bplease\s+refer\b/i,
    /\bfinance\s+charge\b/i,
    /\btax\s+invoice\b/i,
    /\bgst\s+registration\b/i,
    /\bco\.\s*reg\b/i,
    /\bcard\s+no\.?\s*:/i,
    /\bsignature\s+card\s+no/i,
    /\bvisa\s+signature\s+card/i,
    /\baltitude\s+visa/i,
    /\b\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\b/,     // Card numbers
    /\d+\.\d{2}\s+CR\s*$/i,                   // Ends with amount + "CR" (payment credit)
    // NOTE: Balance B/F is intentionally NOT skipped - needed for balance tracking
    /per\s+annum\b/i,
    /late\s+payment\s+charge\b/i,
    /\$\s*\$/,                                // "$  $" pattern from statement header
    /\$\d{1,3}(?:,\d{3})*\.\d{2}/,           // Dollar amounts with $ sign (statement header)
    /ref\s*no\s*:/i,                         // "REF NO:" lines
  ];
  return skipPatterns.some(pattern => pattern.test(line));
}

/**
 * Parses a multi-line transaction into cells.
 * Does NOT classify as withdrawal/deposit - that's done via balance comparison.
 * 
 * Returns array: [Date, Description, TransactionAmount, Balance]
 * Empty string for columns without values.
 */
function parseMultiLineTransaction(lines: string[]): string[] | null {
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  const firstLineTrimmed = firstLine.trim();
  const date = extractDate(firstLineTrimmed);
  if (!date) return null;

  // Use 4 columns: Date, Description, TransactionAmount, Balance
  const result: string[] = ['', '', '', ''];
  result[0] = date;

  // Collect all text and amounts from all lines
  const allText: string[] = [];
  const allAmounts: string[] = [];

  for (const line of lines) {
    const lineTrimmed = line.trim();
    if (!lineTrimmed) continue;

    // Extract amounts
    const amountPattern = /\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g;
    let match;
    while ((match = amountPattern.exec(lineTrimmed)) !== null) {
      allAmounts.push(match[1]);
    }

    // Extract non-amount text
    const textOnly = lineTrimmed
      .replace(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g, '') // Remove amounts
      .replace(date, '') // Remove date from first line
      .trim();
    if (textOnly) allText.push(textOnly);
  }

  const description = allText.join(' ').trim();
  result[1] = description;

  if (allAmounts.length === 0) return null;

  // Simple extraction: last amount is balance, first non-balance amount is transaction
  if (allAmounts.length === 1) {
    // Single amount - could be balance-only row (e.g., "BALANCE B/F")
    if (/balance\s*b\/?f/i.test(description)) {
      result[3] = allAmounts[0]; // Just balance
    } else {
      // Assume it's a transaction without separate balance shown
      result[2] = allAmounts[0]; // Transaction amount
    }
  } else if (allAmounts.length >= 2) {
    // Last amount is balance, first is transaction amount
    result[2] = allAmounts[0]; // Transaction amount
    result[3] = allAmounts[allAmounts.length - 1]; // Balance
  }

  return result;
}

/**
 * Extracts tables from a single page's text content using heuristics.
 * Handles multi-line transactions where description spans multiple lines.
 * Uses column positions from headers to correctly map amounts.
 *
 * @param pageText - The raw text content of a single page
 * @param pageNumber - The 1-indexed page number
 * @returns Array of tables found on this page
 */
export function extractTablesFromPageText(
  pageText: string,
  pageNumber: number
): ParsedTable[] {
  const lines = pageText.split(/\r?\n/);
  const tables: ParsedTable[] = [];

  let currentBlock: string[][] = [];
  let headerRow: string[] | null = null;
  let rawHeaderLine: string | null = null;
  let columnPositions: ColumnInfo[] | null = null;
  let currentTransaction: string[] = [];

  const flushTransaction = () => {
    if (currentTransaction.length > 0) {
      let parsed: string[] | null = null;

      // Use column positions if available, otherwise fall back to heuristics
      if (columnPositions && columnPositions.length > 0) {
        parsed = parseTransactionWithColumnPositions(currentTransaction, columnPositions);

        // Convert to standard 5-column format: [Date, Description, Withdrawal, Deposit, Balance]
        if (parsed) {
          const withdrawalIdx = columnPositions.findIndex(c => /withdrawal|debit/i.test(c.name));
          const depositIdx = columnPositions.findIndex(c => /deposit|credit/i.test(c.name));
          const balanceIdx = columnPositions.findIndex(c => /balance/i.test(c.name));
          const descIdx = columnPositions.findIndex(c => /description|particulars/i.test(c.name));
          const dateIdx = columnPositions.findIndex(c => /date/i.test(c.name));

          const standardRow = [
            dateIdx >= 0 ? parsed[dateIdx] : '',
            descIdx >= 0 ? parsed[descIdx] : '',
            withdrawalIdx >= 0 ? parsed[withdrawalIdx] : '',
            depositIdx >= 0 ? parsed[depositIdx] : '',
            balanceIdx >= 0 ? parsed[balanceIdx] : ''
          ];
          parsed = standardRow;
        }
      } else {
        parsed = parseMultiLineTransaction(currentTransaction);
      }

      if (parsed && parsed.length >= 2) {
        currentBlock.push(parsed);
      }
      currentTransaction = [];
    }
  };

  const flushBlock = () => {
    flushTransaction();
    if (currentBlock.length >= MIN_ROWS_FOR_TABLE) {
      tables.push({
        page: pageNumber,
        headers: headerRow,
        rows: currentBlock,
      });
    }
    currentBlock = [];
    headerRow = null;
    rawHeaderLine = null;
    columnPositions = null;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Empty line - might indicate section break
    if (!trimmedLine) {
      // Don't flush on empty lines within transactions
      // Only flush if we have a substantial block
      if (currentBlock.length >= MIN_ROWS_FOR_TABLE && currentTransaction.length === 0) {
        flushBlock();
      }
      continue;
    }

    // Check for summary/end-of-table lines - stop processing this block
    if (isSummaryOrEndLine(trimmedLine)) {
      flushBlock();
      continue;
    }

    // Skip non-transaction lines (preamble, card info, etc.)
    if (isNonTransactionLine(trimmedLine)) {
      // If we're in the middle of collecting a transaction, flush it first
      flushTransaction();
      continue;
    }

    // Check for header row
    if (isHeaderLine(trimmedLine) && currentBlock.length === 0 && currentTransaction.length === 0) {
      headerRow = trimmedLine.split(/\s{2,}/).filter(Boolean);
      rawHeaderLine = line; // Keep original line with spacing
      columnPositions = extractHeaderColumnPositions(line);
      continue;
    }

    // Check if this line starts a new transaction (has a date at the beginning)
    if (startsWithDate(trimmedLine)) {
      // Flush previous transaction if any
      flushTransaction();
      // Start new transaction - keep original line with spacing for column detection
      currentTransaction = [line];
    } else if (currentTransaction.length > 0) {
      // Continuation of current transaction - but skip if it looks like preamble
      currentTransaction.push(line);
    } else {
      // Not part of a transaction - check if it's a generic table row
      const cells = trimmedLine.split(/\s{2,}/).filter(Boolean);
      if (cells.length >= MIN_CELLS_PER_LINE) {
        currentBlock.push(cells);
      }
    }
  }

  // Flush remaining data
  flushBlock();

  return tables;
}

/**
 * Attempts to identify if the first row of a block is a header row.
 *
 * @param rows - Array of cell arrays
 * @returns The header row if detected, null otherwise
 */
export function guessHeaders(rows: string[][]): string[] | null {
  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const allCellsHaveLetters = firstRow.every((cell) => /[A-Za-z]/.test(cell));

  return allCellsHaveLetters ? firstRow : null;
}

/**
 * Infer a default year from the statement text to support date strings without a year.
 * Picks the most recent year found in recognizable date patterns.
 */
function inferDefaultYearFromText(text: string): number | undefined {
  const yearCandidates = new Set<number>();
  const currentYear = new Date().getFullYear();

  // 1. Explicit Statement Date patterns (highest confidence)
  // Matches: "Statement Date: 30 Dec 2025", "Date: 12 January 2025"
  const statementDatePattern = /(?:statement|bill)?\s*date\s*[:.]?\s*(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\w*\s+(?:20\d{2}|19\d{2}))/gi;
  let match: RegExpExecArray | null;
  while ((match = statementDatePattern.exec(text)) !== null) {
    const yearMatch = match[1].match(/(20\d{2}|19\d{2})/);
    if (yearMatch) {
      yearCandidates.add(Number(yearMatch[1]));
    }
  }

  // 2. DD/MM/YYYY etc
  const dmyPattern = /\b\d{1,2}[/-]\d{1,2}[/-](\d{2,4})\b/g;
  while ((match = dmyPattern.exec(text)) !== null) {
    const year = coerceYear(match[1]);
    if (year && year <= currentYear + 1) yearCandidates.add(year); // Sanity check
  }

  // 3. YYYY/MM/DD
  const ymdPattern = /\b(20\d{2}|19\d{2})[/-]\d{1,2}[/-]\d{1,2}\b/g;
  while ((match = ymdPattern.exec(text)) !== null) {
    const year = Number(match[1]);
    if (year <= currentYear + 1) yearCandidates.add(year);
  }

  // 4. DD MMM YYYY (including full months)
  const monthNamePattern =
    /\b\d{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\w*\s+(20\d{2}|19\d{2})\b/gi;
  while ((match = monthNamePattern.exec(text)) !== null) {
    const year = Number(match[2]);
    if (year <= currentYear + 1) yearCandidates.add(year);
  }

  if (yearCandidates.size === 0) return undefined;

  // Prefer the most commonly occurring year? Or just max?
  // Usually max is correct for statements at year boundary (Dec 2025 statement often has Jan 2026 due date)
  // WARNING: "Payment Due Date 26 Jan 2026". "Statement Date 30 Dec 2025".
  // If we pick MAX, we get 2026. This causes the bug!
  // We want the STATEMENT YEAR, not the Due Date year.
  // BUT logic is "inferDefaultYearFromText".
  // If we pick 2026, then "26 JAN" -> 2026 (Correct). "29 NOV" -> "29 NOV 2026" (WRONG).
  // If we pick 2025. "26 JAN" -> "26 JAN 2025" (WRONG - 1 year ago!). "29 NOV" -> "29 NOV 2025" (Correct).

  // This is tricky. Text contains BOTH years.
  // We need to parse dates relative to the "Statement Date" if found.
  // But this function just returns A year.

  // Strategy:
  // If we have explicit "Statement Date" pattern, use that year ONLY.
  // Otherwise, use statistical approach?
  // Or just return undefined and let route.ts handle logic? No, route.ts is simpler.

  // Let's refine:
  // Re-run the specific Statement Date pattern and Return immediately if found.

  const explicitStatementYearRegex = /(?:statement|bill)\s*date\s*[:.]?\s*\d{1,2}\s+(?:[a-z]+)\s+(20\d{2})/i;
  const explicitMatch = text.match(explicitStatementYearRegex);
  if (explicitMatch) {
    console.log('Found explicit statement year:', explicitMatch[1]);
    return Number(explicitMatch[1]);
  }

  // Fallback to frequency/max if no explicit statement date found
  // If we have mixed years (2025 and 2026), and we are in Jan 2026. 
  // It's safer to pick the OLDER year as the "Base Year" for the statement items (usually previous month).
  // But credit cards have "Payment Due" in future year.

  const years = Array.from(yearCandidates).sort();
  // If we have multiple years (e.g. 2025, 2026), return the earlier one (Statement) vs later one (Due Date)?
  // Usually Statement Date <= Due Date.
  if (years.length > 1) {
    // Return the minimum year found (likely the statement year vs due date year)
    return Math.min(...years);
  }

  return years[0];
}

/**
 * Attaches transaction identifiers to rows.
 *
 * Row shape expected: [Date, Description, Amount, Balance?]
 * Returns rows extended with Identifier as the last column.
 */
function appendIdentifiers(
  rows: string[][],
  options: { defaultYear?: number; balanceFallback?: string }
): string[][] {
  const effectiveDefaultYear =
    options.defaultYear ?? new Date().getFullYear();
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

    // Ensure the balance column is present for downstream consumers
    const normalizedBalance =
      balanceRaw && balanceRaw.trim() ? balanceRaw : resolvedBalance;

    return [date, description, amount, normalizedBalance, identifier];
  });
}

function coerceYear(yearStr: string): number | null {
  if (/^\d{4}$/.test(yearStr)) return Number(yearStr);
  if (/^\d{2}$/.test(yearStr)) return 2000 + Number(yearStr);
  return null;
}
