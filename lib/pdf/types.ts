/**
 * Represents a table extracted from a PDF page.
 */
export type ParsedTable = {
  /** 1-indexed page number where the table was found */
  page: number;
  /** Header row cells, or null if no header was detected */
  headers: string[] | null;
  /** Data rows (excluding header if present) */
  rows: string[][];
  /** Optional metadata extracted from the parser context */
  metadata?: {
    inferredYear?: number;
  };
};

/**
 * A parser-rejected row surfaced to the client for manual review.
 * The layout-aware parser drops rows it can't confidently classify and
 * records a reason (e.g. "embedded_date", "summary_section"). These are
 * not transactions; they are reviewable audit entries.
 */
export type RejectedRowSurface = {
  pageNumber: number;
  rejectionReason: string;
  rawLine: string;
};

/**
 * Successful response from the parse endpoint.
 */
export type ParseSuccessResponse = {
  tables: ParsedTable[];
  /** Optional — present when the extractor can surface audit rows. */
  rejectedRows?: RejectedRowSurface[];
};

/**
 * Error response from the parse endpoint.
 */
export type ParseErrorResponse = {
  error: string;
};

/**
 * Union type for all parse endpoint responses.
 */
export type ParseResponse = ParseSuccessResponse | ParseErrorResponse;

/**
 * Sanitizes a transaction description by masking potentially sensitive patterns.
 *
 * Masks:
 * - Card-number-like sequences (16 digits, possibly with spaces/dashes) → `<card_redacted>`
 * - Segmented account numbers (e.g., 123-456-789)                        → `<account_redacted>`
 * - Long digit sequences (9+ digits)                                     → `<digits_redacted>`
 * - Long alphanumeric reference IDs (10+ chars with BOTH letters AND digits) → `<ref_id_redacted>`
 *
 * All redactions use the `<type_redacted>` convention so the mask clearly
 * says what kind of data was removed without leaking any of it.
 *
 * @param desc - The raw description string
 * @returns Sanitized description with sensitive patterns masked
 */
export function sanitizeDescription(desc: string): string {
  return desc
    // Card-number-like sequences (PAN-like): 1234-5678-9012-3456 or 1234 5678 9012 3456
    .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, "<card_redacted>")
    // Segmented account-number-like sequences: 123-456-789
    .replace(/\b\d{3,}(-\d{3,})+\b/g, "<account_redacted>")
    // Long digit sequences (9+ digits)
    .replace(/\b\d{9,}\b/g, "<digits_redacted>")
    // Long alphanumeric reference IDs: must contain BOTH letters AND digits, 10+ chars
    // This avoids matching pure words like "MYREPUBLIC" or "STARBUCKS"
    .replace(/\b(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10,}\b/g, "<ref_id_redacted>");
}
