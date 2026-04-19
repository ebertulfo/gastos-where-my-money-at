# PDF Parsing Pipeline — Spec Document (v3)

## Changelog

| Date | Author | Description |
| :--- | :--- | :--- |
| 2026-04-19 | ebertulfo | v3: Rewrite to reflect `pdfjs-dist`/`unpdf` layout-aware parser, 5-column output with identifiers, signed credit-card amounts, rejected-rows contract, and dual `/parse` + `/ingest` surfaces. |
| 2025-12-03 | ebertulfo | v2: Safe parsing, statement awareness, rate limiting |
| 2025-11-20 | ebertulfo | Initial draft |

## Objective

Build a **layout-aware**, statement-type-agnostic PDF parsing pipeline that:

- Parses PDFs entirely in-memory inside a Node.js serverless function.
- Uses **word-level x/y coordinates** (via `unpdf` → `pdfjs-dist`) to classify transaction columns, instead of regex over flat text.
- Normalizes every transaction row into a fixed shape: `[Date, Description, Amount, Balance, Identifier]`.
- Surfaces **rejected rows** as a first-class part of the response so a human can audit what was dropped.
- Never persists the PDF or its extracted text anywhere (buffer stays in-memory; no disk; no external calls).
- Supports two distinct call surfaces — a stateless `POST /api/statements/parse` (preview) and an authenticated `POST /api/statements/ingest` (persist to DB).

## API Surfaces

Two routes share the same extractor (`lib/pdf/extract-tables.ts` → `extractTablesAndRejections(buffer)`):

| Concern | `POST /api/statements/parse` | `POST /api/statements/ingest` |
| :--- | :--- | :--- |
| Purpose | Stateless preview/inspection | Authenticated upload → DB |
| Auth | None | Bearer token → Supabase user |
| Max size | 1 MB | 4 MB |
| `maxDuration` | 20 s | 30 s |
| Rate limit | `ENABLE_RATE_LIMIT` env toggle (shared limiter) | Same |
| Response body | `{ tables, rejectedRows }` | `{ statementId, isDuplicate?, status? }` |
| Persistence | None | Creates `statements` + stages `transaction_imports` |

### `POST /api/statements/parse`

Request: `multipart/form-data` with a single `file` field (`application/pdf`, ≤ 1 MB).

#### Success — 200
```json
{
  "tables": [
    {
      "page": 1,
      "headers": ["Date", "Description", "Amount", "Balance", "Identifier"],
      "rows": [
        ["01/09/2024", "GRAB *GRABTAXI", "12.50", "4188.45", "20240901-12.50-4188.45-a1b2c3d4"]
      ],
      "metadata": { "inferredYear": 2024 }
    }
  ],
  "rejectedRows": [
    { "pageNumber": 2, "rejectionReason": "summary_section", "rawLine": "Total withdrawals 1,234.56" }
  ]
}
```

#### Errors

| Condition | Status | Body |
| :--- | :--- | :--- |
| Invalid form data | 400 | `{ "error": "Invalid request. Expected multipart/form-data." }` |
| Missing file | 400 | `{ "error": "Missing file. Please upload a PDF file." }` |
| Not PDF | 400 | `{ "error": "Only PDF files are allowed." }` |
| Too large | 413 | `{ "error": "File too large. Max size is 1 MB." }` |
| Scanned / no tabular data | 422 | `{ "error": "No tabular data found. We only support text-based, tabular statements right now." }` |
| No transactions extracted | 422 | `{ "error": "No transactions could be extracted from this statement." }` |
| Rate-limited | 429 | `{ "error": "Rate limit exceeded. Try again later." }` |
| Internal error | 500 | `{ "error": "An unexpected error occurred while processing the PDF." }` |

### `POST /api/statements/ingest`

Same parsing path, plus auth + persistence. Returns `{ statementId, isDuplicate, status }`. On duplicate file hash (same `uploaded_by` + `source_file_sha256`) short-circuits and returns the existing statement id with `isDuplicate: true`.

## Extraction Pipeline

```
PDF buffer
 └─ extractPageWords() via unpdf (pdfjs-dist)   → PageWords[]
     └─ groupWordsIntoLines(words, yTol=3.0)    → TextLine[]
         └─ selectProfile(file, name, lines)    → StatementProfile
             └─ GenericTransactionParser.parseLines(lines, ctx)
                 → { transactions: Transaction[], rejections: RejectedRow[] }
```

Relevant modules:

- `lib/pdf/words.ts` — pdfjs/unpdf extractor; returns `{ pageNumber, text, words: {x0,y0,x1,y1,text}[] }`.
- `lib/pdf/lines.ts` — groups words into `TextLine`s by y-coordinate tolerance.
- `lib/pdf/sections.ts` — section markers (`transaction_section`, `summary_section`, `account_overview`, `investment_section`) and classifier.
- `lib/pdf/parser.ts` — the layout-aware `GenericTransactionParser` (~650 LOC). TypeScript port of the upstream Python `src/parser.py`. Owns date detection, amount columnisation, running-balance sign inference, section gating, and rejection logging.
- `lib/pdf/profiles.ts` — `GENERIC_PROFILE`, `ALTITUDE_PROFILE` (DBS Altitude credit card), `DBS_PROFILE` (DBS Multiplier / POSB / eMySavings). Profile is selected by scanning the first ~50 lines for brand markers; Altitude is checked first because Altitude statements also mention "DBS".
- `lib/pdf/polyfill-promise-try.ts` — must be imported before `unpdf`; shims `Promise.try` on Node 22.14.
- `lib/pdf/types.ts` — `ParsedTable`, `ParseSuccessResponse`, and the `sanitizeDescription()` helper.
- `lib/pdf/extract-tables.ts` — orchestrates the pipeline, maps parser `Transaction`s to the 5-column row shape, infers `defaultYear`, and calls `appendIdentifiers()` to attach the per-row identifier via `lib/transaction-identifier.ts`.

## Row Shape & Amount Sign Convention

Every row has exactly five cells: `[Date, Description, Amount, Balance, Identifier]`.

| Column | Format |
| :--- | :--- |
| `Date` | Raw statement-format date string (parser preserves the PDF's format; normalization happens at identifier time). |
| `Description` | Sanitized via `sanitizeDescription()` (see below). |
| `Amount` | Two-decimal fixed string. **Sign depends on profile** — see below. |
| `Balance` | Two-decimal fixed string, or `"0.00"` fallback when not present (credit cards always get `"0.00"`). |
| `Identifier` | `YYYYMMDD-<amount>-<balance>-<descHash8>`, see Spec 1. |

**Amount sign by profile:**
- `DBS_PROFILE` (bank): emits **withdrawals only**, with positive amounts. Deposits are filtered. Sign is classified via column x-band and running balance.
- `ALTITUDE_PROFILE` (credit card): emits **all rows, signed** — credits are negative (e.g. `"-25.45"`), so summing the column reconciles with the statement's "new charges" total.
- `GENERIC_PROFILE`: emits all rows with `Math.abs(amount)` (matches pre-port behaviour).

## Rejected Rows

The parser does not throw on ambiguous lines — it records a `RejectedRow` with a reason and continues. Reviewable reasons are surfaced in the `/parse` response; non-reviewable rejections (e.g., plain noise) are dropped silently. Typical reasons: `summary_section`, `account_overview`, `investment_section`, `embedded_date`, `continuation_noise`, `content_noise`.

The ingest path does **not** surface rejections to the client — they are observable only via `/parse` previews.

## Date Inference

`inferDefaultYearFromText()` scans the flat combined text for year hints in this priority order:

1. Explicit "Statement date: DD Month YYYY" phrase.
2. Any `DD/MM/YYYY` or `DD-MM-YY` tokens.
3. Any `YYYY/MM/DD` tokens.
4. Any `DD Month YYYY` tokens.

If multiple years are found, the **oldest** wins (covers the "Aug 2024 statement printed in Sep 2024" case). Years > `currentYear + 1` are discarded. The resulting year is passed to the identifier generator as `defaultYear` so rows like `"19 SEP"` (no year) resolve correctly.

## Sanitization

Run **after extraction, before** storage / LLM calls / API response. Implementation in `lib/pdf/types.ts`:

| Pattern | Regex | Replacement |
| :--- | :--- | :--- |
| PAN-like (16 digits) | `\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b` | `<card_redacted>` |
| Segmented account-number-like | `\b\d{3,}(-\d{3,})+\b` | `<account_redacted>` |
| Long digit sequences (≥ 9 digits) | `\b\d{9,}\b` | `<digits_redacted>` |
| Alphanumeric ref ids (≥ 10 chars, must contain **both** letters and digits) | `\b(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10,}\b` | `<ref_id_redacted>` |

The alphanumeric rule requires both letter and digit to avoid masking merchant names like `MYREPUBLIC` or `STARBUCKS`. Masks use `<type_redacted>` tags (not asterisks) so the mask self-describes what was removed.

## Security Requirements

- Never write the buffer or extracted text to disk.
- Never log raw descriptions or page text. Rejection logs include the raw line for debugging — they stay server-side except through the `/parse` response, which is stateless.
- Never send PDFs to external services.
- No LLM calls in this path.
- `unpdf`/`pdfjs-dist` resources are released automatically when the promise resolves; the buffer is eligible for GC immediately after `extractPageWords` returns.

## Validation Order (`/parse`)

1. Rate-limit check (if enabled).
2. Parse multipart form-data.
3. Validate file presence + MIME type.
4. Read into `Buffer`.
5. Validate size after read (more accurate than Content-Length).
6. Run `extractTablesAndRejections(buffer)`.
7. Return `{ tables, rejectedRows }` or map `UnsupportedPdfError` → 422.

`/ingest` inserts: (a) bearer-token auth and user resolution immediately before step 2, (b) `statements` + `transaction_imports` inserts after step 6 via `lib/db/ingest.ts`.

## Non-Goals

- Categorization / merchant normalization (lives downstream of ingest).
- OCR or scanned-PDF support.
- Currency detection (currency comes from statement metadata or `user_settings`).
- UI for table selection or row editing.

## Implementation Status

- [x] `POST /api/statements/parse` (stateless preview)
- [x] `POST /api/statements/ingest` (authenticated persist)
- [x] `unpdf`/`pdfjs-dist` word-coord extraction
- [x] Layout-aware parser with section classifier + profiles
- [x] Rejected-row surfacing for audit
- [x] Signed credit-card amounts (Altitude)
- [x] Withdrawal-only filter for bank statements (DBS)
- [x] `defaultYear` inference for missing-year dates
- [x] Per-row identifier generation (Spec 1)
- [x] Sanitization with `<type_redacted>` masks
- [x] Unit tests in `lib/pdf/__tests__/`

## File Structure

```
lib/
  pdf/
    extract-tables.ts         # Orchestrator + 5-column row mapping
    parser.ts                 # GenericTransactionParser (layout-aware)
    profiles.ts               # GENERIC / ALTITUDE / DBS
    sections.ts               # Section markers + classifier
    lines.ts                  # Word → TextLine grouping
    words.ts                  # unpdf/pdfjs word extraction
    models.ts                 # Transaction / RejectedRow types
    types.ts                  # ParsedTable / sanitizeDescription
    polyfill-promise-try.ts   # Node 22.14 shim (must import first)
    __tests__/
      parser.test.ts
      lines.test.ts
      sanitize.test.ts
  rate-limit.ts               # In-memory limiter (env-gated)
  transaction-identifier.ts   # Per-row identifier (see Spec 1)
  db/
    ingest.ts                 # statements + transaction_imports writer
app/
  api/
    statements/
      parse/route.ts          # Preview endpoint
      ingest/route.ts         # Authenticated persist endpoint
```

---

_File: `docs/specs/0-transactions-extractor.md`_
