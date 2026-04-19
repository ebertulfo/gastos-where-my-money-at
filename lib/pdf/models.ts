/**
 * Parser domain types — the TS equivalents of src/models.py in the Python
 * reference implementation.
 */

import type { Word } from "./words";

export type TextLine = {
  text: string;
  words: Word[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type Transaction = {
  sourceFile: string;
  statementName: string;
  pageNumber: number;
  transactionDate: string;
  description: string;
  /** Signed amount in major currency units. Debits are negative, credits positive. */
  amount: number;
  currency: string;
  /** "debit" | "credit" | "" if the parser couldn't infer. */
  debitCredit: "" | "debit" | "credit";
  runningBalance: number | null;
  extractionMethod: "text" | "ocr";
  /** Reconstructed raw line text, preserved for audit. */
  rawLine: string;
};

export type RejectedRow = {
  sourceFile: string;
  statementName: string;
  pageNumber: number;
  rejectionReason: string;
  rawLine: string;
  extractionMethod: "text" | "ocr";
};
