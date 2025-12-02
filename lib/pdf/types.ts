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
};

/**
 * Successful response from the parse endpoint.
 */
export type ParseSuccessResponse = {
  tables: ParsedTable[];
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
