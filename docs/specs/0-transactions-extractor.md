# PDF Parsing Pipeline — Spec Document (v2)

## Changelog

| Date | Author | Description |
| :--- | :--- | :--- |
| 2025-12-03 | ebertulfo | v2 Update: Safe parsing, statement awareness, rate limiting |
| 2025-11-20 | ebertulfo | Initial draft |

## Objective

Build a safe, **statement-aware** PDF parsing pipeline that:

- Accepts a max 1 MB PDF.
- Parses the PDF in-memory inside a serverless function.
- Does NOT store the PDF anywhere (temporary or permanent).
- **Detects statement type** (bank statement vs credit card statement).
- Extracts transaction data using **statement-type-specific parsing**.
- **Consolidates all pages into a single table** with consistent columns.
- Returns the table to the client as JSON.
- Rejects unsupported PDFs (scanned/image-based or non-tabular).
- Enforces rate limiting (1 parse per user/IP per minute, configurable via env var).

This endpoint extracts and **normalizes transaction data**. Further categorization happens in a separate API.

## API Endpoint

`POST /api/statements/parse`

### Request

- Content type: `multipart/form-data`
- Field: `file` — a single `.pdf` file, ≤ 1 MB

### Responses

#### Success — 200

Returns a **single consolidated table** with normalized columns:

**Bank Statement:**
```json
{
  "tables": [
    {
      "page": 1,
      "headers": ["Date", "Description", "Amount"],
      "rows": [
        ["29 AUG", "GRAB *GRABTAXI", "12.50"],
        ["29 AUG", "SHOPEE SG", "45.00"]
      ]
    }
  ]
}
```

**Credit Card Statement:**
```json
{
  "tables": [
    {
      "page": 1,
      "headers": ["Date", "Description", "Amount"],
      "rows": [
        ["05 SEP", "APPLE.COM/BILL", "14.98"],
        ["07 SEP", "AMAZON PRIME", "9.90"]
      ]
    }
  ]
}
```

Note: For bank statements, only **withdrawals** (expenses) are extracted. Deposits are filtered out using balance comparison logic.

#### Unsupported — 422
```json
{ "error": "No tabular data found. We only support text-based, tabular statements right now." }
```

#### Too Large — 413
```json
{ "error": "File too large. Max size is 1 MB." }
```

#### Invalid — 400
```json
{ "error": "Only PDF files are allowed." }
```
```json
{ "error": "Missing file. Please upload a PDF file." }
```
```json
{ "error": "Invalid request. Expected multipart/form-data." }
```

#### Rate Limit Exceeded — 429
```json
{ "error": "Rate limit exceeded. Try again later." }
```

## Functional Requirements

### 1) Memory-Based Processing Only (No Storage)

- The serverless function must:
  - Read the uploaded file into memory (`arrayBuffer()` → `Buffer`).
  - Process it immediately in-memory.
  - Never write the file or extracted text to disk or external storage (e.g., Supabase).
  - Allow the buffer to be garbage-collected after the request completes.

### 2) PDF Extraction Library

- Runtime: Node.js (`runtime = "nodejs"` in route config)
- Library: `pdf-parse` with page-level text extraction
- Reject PDFs when:
  - `data.text` is extremely short (< 50 chars) — likely a scanned/image PDF.
  - No transaction data is detected after parsing.

### 3) Statement Type Detection

The parser automatically detects the statement type based on content patterns:

**Bank Statement Detection:**
```js
/withdrawal|deposit|balance brought forward/i
```

**Credit Card Statement Detection:**
```js
/credit card|card number|statement date|minimum payment|previous balance/i
```

Different extraction strategies are applied based on detected type.

### 4) Transaction Extraction (Statement-Specific)

#### Bank Statements

1. Parse page-by-page using `pdf-parse` page extraction.
2. Detect transaction lines by date patterns at line start.
3. Handle **multi-line transactions** where descriptions span multiple lines.
4. Extract column positions from header line for accurate amount mapping.
5. Parse into intermediate format: `[Date, Description, TransactionAmount, Balance]`
6. **Filter to withdrawals only** using balance comparison:
   - Track running balance across transactions.
   - If `currentBalance < previousBalance`, it's a withdrawal (include).
   - If `currentBalance >= previousBalance`, it's a deposit (exclude).
7. Output final format: `[Date, Description, Amount]`

#### Credit Card Statements

1. Parse page-by-page.
2. Detect transaction lines by date patterns.
3. Handle multi-line descriptions.
4. Extract **column amounts** (rightmost amount separated by whitespace).
5. Filter out non-transaction lines (preamble, card info, summary rows).
6. Output format: `[Date, Description, Amount]`

### 5) Date Pattern Recognition

Supported date formats:
```js
/^\d{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i  // "29 AUG"
/^\d{1,2}\/\d{1,2}\/\d{2,4}/                                         // "05/09/2024"
/^\d{1,2}-\d{1,2}-\d{2,4}/                                           // "05-09-2024"
/^\d{1,2}\s+\w{3}\s+\d{2,4}/                                         // "05 Sep 2024"
```

### 6) Output Format

Returns a **single consolidated table** combining all pages:

```ts
type ParsedTable = {
  page: number;              // Always 1 (represents "all pages")
  headers: string[] | null;  // ["Date", "Description", "Amount"]
  rows: string[][];          // Transaction data
  /** Optional metadata extracted from the parser context */
  metadata?: {
    inferredYear?: number;   // Year inferred from statement text (e.g. "Sep 2024")
  };
};

type ParseSuccessResponse = {
  tables: ParsedTable[];     // Always contains exactly one table
};

type ParseErrorResponse = {
  error: string;
};
```

### 7) Filtered Content

The following are automatically filtered out:

**Summary/End Lines:**
- Total rows, balance carried forward
- Interest credit summaries
- Lines starting with dashes (separators)

**Non-Transaction Lines:**
- Statement preamble (dates, limits, due dates)
- Card number patterns
- Payment credits (ending with "CR")
- Balance B/F rows (used for balance tracking only)

### 8) Rate Limiting

- **Configurable** via `ENABLE_RATE_LIMIT` environment variable.
- When enabled (`ENABLE_RATE_LIMIT=true`): Enforce one parse per 60 seconds per IP.
- When disabled (default): No rate limiting applied.
- If the limit is exceeded, return `429`.
- Implementation: In-memory store (suitable for single-instance deployments).

## Serverless Implementation Notes

### Runtime Configuration

```ts
// Ensure Node.js runtime for pdf-parse compatibility
export const runtime = "nodejs";

// Allow up to 20 seconds for PDF processing
export const maxDuration = 20;
```

### Validation Order

1. Check rate limit (if enabled)
2. Parse multipart form data
3. Validate file presence
4. Validate file type (PDF only)
5. Read file into buffer
6. Validate file size (≤ 1 MB)
7. Extract tables

### PDF Parsing

```ts
import { PDFParse } from "pdf-parse";

const parser = new PDFParse({ data: buffer });
const textResult = await parser.getText();
// Access pages via textResult.pages
await parser.destroy(); // Clean up resources
```

## Helper Functions Implemented

1. **`extractTablesFromPdf(buffer: Buffer): Promise<ParsedTable[]>`**
   - Main entry point
   - Detects statement type (bank vs credit card)
   - Routes to appropriate extraction function
   - Consolidates all pages into single table
   - Filters withdrawals only for bank statements

2. **`extractTablesFromPageText(pageText: string, pageNumber: number): ParsedTable[]`**
   - Handles bank statement pages
   - Uses column position detection from headers
   - Groups multi-line transactions
   - Returns intermediate format with all columns

3. **`extractCreditCardTransactions(pageText: string, pageNumber: number): ParsedTable[]`**
   - Handles credit card statement pages
   - Detects column amounts (rightmost, whitespace-separated)
   - Handles multi-line descriptions
   - Filters non-transaction content

4. **`parseMultiLineTransaction(lines: string[]): string[] | null`**
   - Parses multi-line bank transactions
   - Returns `[Date, Description, TransactionAmount, Balance]`

5. **`extractHeaderColumnPositions(headerLine: string): ColumnInfo[]`**
   - Extracts column positions from header line
   - Used for accurate amount-to-column mapping

6. **`startsWithDate(line: string): boolean`** / **`extractDate(line: string): string | null`**
   - Date pattern detection and extraction

7. **`extractColumnAmount(line: string): string | null`**
   - Extracts amount from column position (rightmost)

8. **`isSummaryOrEndLine(line: string): boolean`** / **`isNonTransactionLine(line: string): boolean`**
   - Content filtering helpers

9. **`guessHeaders(rows: string[][]): string[] | null`**
   - Heuristic header detection (all cells contain letters)

## Error Handling

| Condition | Response | Notes |
|---|---:|---|
| Rate limit exceeded | 429 | Only when ENABLE_RATE_LIMIT=true |
| Invalid form data | 400 | Expected multipart/form-data |
| Missing file | 400 | File field required |
| Not PDF | 400 | Reject early |
| PDF > 1 MB | 413 | Enforced after reading buffer |
| Scanned PDF (image-based) | 422 | Empty or minimal text (< 50 chars) |
| No transactions detected | 422 | "Unsupported PDF" |
| Internal errors | 500 | Log server-side only, generic message to client |

## Custom Error Class

```ts
export class UnsupportedPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedPdfError";
  }
}
```

## Security Requirements

- Never store the PDF or extracted text.
- Never log PDF bytes or full extracted text.
- Do not write temporary files to disk.
- Do not send raw PDFs to any external service.
- Do not call LLMs inside this endpoint — all processing stays in your infra.
- Enforce strict rate limits and validation.
- Clean up parser resources with `parser.destroy()`.

## 🔒 Sanitization & Safety Layer (Mandatory)

All extracted transactions must be sanitized before being stored, sent to an LLM, or returned through the API.

### Sanitization Rules

Mask harmful numeric/identifier patterns inside the **Description** field:

| Pattern | Regex | Replacement |
|---------|-------|-------------|
| Card-number-like sequences (PAN-like) | `\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b` | `****-****-****-****` |
| Segmented account-number-like sequences | `\b\d{3,}(-\d{3,})+\b` | `**********` |
| Long digit sequences (≥ 9 digits) | `\b\d{9,}\b` | `**********` |
| Long alphanumeric reference IDs (mixed letters+digits, 10+ chars) | `\b(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10,}\b` | `<ref_id_redacted>` |

**Note:** The alphanumeric pattern requires BOTH letters AND digits to avoid masking merchant names like "MYREPUBLIC" or "STARBUCKS".

### Sanitization Function

```ts
export function sanitizeDescription(desc: string): string {
  return desc
    .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, "****-****-****-****")
    .replace(/\b\d{3,}(-\d{3,})+\b/g, "**********")
    .replace(/\b\d{9,}\b/g, "**********")
    .replace(/\b(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10,}\b/g, "<ref_id_redacted>");
}
```

### Pipeline Placement

Run sanitization **after extraction** and **before**:
- Deduplication
- DB storage
- LLM calls
- API response

### Purpose

- Prevent storage of PCI-adjacent identifiers
- Prevent raw account/card leakage
- Keep transactions useful but non-compromising

## Non-Goals (Out of Scope)

- Transaction categorization (handled by `/api/statements/interpret`).
- Currency detection or normalization.
- Handling scanned PDFs / OCR.
- Multiple account support within single statement.
- UI for table selection or confirmation.
- Saving transactions to a database.

These features belong to later stages of the pipeline.

## Implementation Status

- [x] API route: `POST /api/statements/parse`
- [x] File validation (type, size)
- [x] Rate limiting (configurable)
- [x] PDF text extraction via pdf-parse
- [x] Statement type detection (bank vs credit card)
- [x] Bank statement parsing with multi-line support
- [x] Credit card statement parsing
- [x] Withdrawal filtering for bank statements
- [x] Single consolidated table output
- [x] Error handling with custom UnsupportedPdfError
- [x] TypeScript types for responses
- [x] Sanitization layer for sensitive data
- [x] Sanitization tests (26 passing)

## File Structure

```
lib/
  pdf/
    extract-tables.ts   # Core extraction logic
    types.ts            # TypeScript types + sanitizeDescription
    __tests__/
      sanitize.test.ts  # Sanitization tests
  rate-limit.ts         # Rate limiting implementation
app/
  api/
    statements/
      parse/
        route.ts        # API endpoint
```

---

_File: `docs/specs/0-transactions-extractor.md`_