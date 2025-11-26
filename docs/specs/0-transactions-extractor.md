# PDF Parsing Pipeline — Spec Document (v1)

_Last updated: 2025-11-26_

## Objective

Build a safe, generic PDF parsing pipeline that:

- Accepts a max 1 MB PDF.
- Parses the PDF in-memory inside a serverless function.
- Does NOT store the PDF anywhere (temporary or permanent).
- Extracts all tabular data from the PDF into structured tables.
- Returns those tables to the client as JSON.
- Rejects unsupported PDFs (scanned/image-based or non-tabular).
- Enforces rate limiting (1 parse per user/IP per minute).
- Does NOT attempt to interpret or normalize columns — extraction only.

This endpoint is for extraction only. Categorization or interpretation happens in a separate API.

## API Endpoint

`POST /api/statements/parse`

### Request

- Content type: `multipart/form-data`
- Field: `file` — a single `.pdf` file, ≤ 1 MB

### Responses

#### Success — 200
```json
{
  "tables": [
    {
      "page": 1,
      "headers": ["DATE", "DESCRIPTION", "AMOUNT (S$)"],
      "rows": [
        ["01/03/2024", "GRAB *RIDE", "-9.80"],
        ["01/03/2024", "COLD STORAGE #123", "-42.05"]
      ]
    },
    {
      "page": 2,
      "headers": null,
      "rows": [
        ["VAL1", "VAL2"],
        ["VAL3", "VAL4"]
      ]
    }
  ]
}
```

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

- Runtime: Node.js
- Recommended library: `pdf-parse` for text extraction
- Reject PDFs when:
  - `data.text` is extremely short (e.g. < 50 chars).
  - `data.text` contains no meaningful text (likely a scanned/image PDF).

### 3) Tabular Data Extraction (Heuristic-Based)

For each page:

1. Split raw text by form feed: `data.text.split(/\f/)` to get pages.
2. Split each page into lines.
3. Consider a line a "candidate table line" when splitting by two-or-more spaces yields ≥ 3 cells:

```js
const cells = line.split(/\s{2,}/);
const isCandidate = cells.length >= 3;
```

4. Group consecutive candidate lines into blocks.
5. Reject blocks with highly inconsistent column counts: `(maxCols - minCols) > 2`.
6. Treat the first row as header only if all header cells contain at least one letter (`/[A-Za-z]/`).

Notes:
- Use conservative heuristics — prefer false-negatives (missed tables) over incorrect parsing.

### 4) Output Format

Each detected table must follow the `ParsedTable` type:

```ts
type ParsedTable = {
  page: number;
  headers: string[] | null;
  rows: string[][];
};
```

### 5) No Semantic Processing

Do not attempt to interpret or normalize columns. Do not infer which column is a date, amount, or card type. This endpoint only extracts tabular data.

### 6) Rate Limiting

- Enforce one parse per 60 seconds per user (if authenticated) or per IP (if unauthenticated).
- If the limit is exceeded, return `429`.

## Serverless Implementation Notes

### Runtime

- Ensure `runtime = "nodejs"` is specified in the route file.
- Function timeout should be ≥ 20 seconds to allow for larger but valid parsing operations.

### Validate Upload Early

- Reject requests that:
  - Are not PDFs
  - Exceed 1 MB
  - Are missing the `file` field

### Extract Text

```js
const data = await pdfParse(buffer);
```

### Detect Tables

Use the tabular heuristics described above. If no tables are detected, return 422.

## Helper Functions to Implement

1. `extractTablesFromPdf(buffer: Buffer): Promise<ParsedTable[]>`

   - Call `pdfParse(buffer)`.
   - Reject early if `data.text` is too short → treat as scanned/unsupported.
   - Split by page: `data.text.split(/\f/)`.
   - For each page, call `extractTablesFromPageText(pageText, pageIndex)`.

2. `extractTablesFromPageText(pageText: string, pageNumber: number): ParsedTable[]`

   - Split into lines.
   - For each line, compute `cells = line.split(/\s{2,}/)`.
   - Mark `isTableLike = cells.length >= 3`.
   - Group consecutive table-like lines into blocks.
   - Filter out blocks with inconsistent columns (maxCols - minCols > 2) or < 2 rows.
   - Use `guessHeaders(block)` to determine headers, returning `string[] | null`.

3. `guessHeaders(block): string[] | null`

   - Heuristic: if the first row has at least one letter in every cell, treat it as headers.

4. `tableToCsv(table)` (optional)

   - Implement safe CSV escaping if CSV output is needed.

## Failure Scenarios

| Condition | Response | Notes |
|---|---:|---|
| PDF > 1 MB | 413 | Enforced at upload stage |
| Not PDF | 400 | Reject early |
| Scanned PDF (image-based) | 422 | Empty or minimal `data.text` |
| No tables detected | 422 | "Unsupported PDF" |
| Internal errors | 500 | Log server-side only |

## Security Requirements

- Never store the PDF or extracted text.
- Never log PDF bytes or full extracted text.
- Do not write temporary files to disk.
- Do not send raw PDFs to any external service.
- Do not call LLMs inside this endpoint — all processing stays in your infra.
- Enforce strict rate limits and validation.

## Non-Goals (Out of Scope)

- Categorizing transactions.
- Identifying "date" or "amount" columns.
- Detecting currency.
- Reconstructing severely malformed tables.
- Handling scanned PDFs / OCR.
- Building a UI for table selection.
- Saving transactions to a database.

These features belong to later stages of the pipeline.

## Next Steps (Outside This Endpoint)

- Implement a second endpoint: `POST /api/statements/interpret`.
  - Accepts a selected table.
  - Uses an LLM (outside this extract-only endpoint) to identify date/description/amount columns.
  - Categorizes transactions and provides a user confirmation UI.
  - Saves confirmed transactions to Supabase.

---

_File: `docs/specs/transactions-extractor.md`_