# Transaction Storage & Deduplication — Spec (v0.1)

## Changelog

| Date | Author | Description |
| :--- | :--- | :--- |
| 2025-12-08 | ebertulfo | Updated with M1 features: Transactions page, Filename fallback, Duplicate safety |
| 2025-12-05 | ebertulfo | Initial draft defining storage schema and deduplication rules |

## Objective

Persist extracted transactions from multiple statements without losing history, while preventing silent overwrites of duplicates. The stored data will later feed an LLM-driven classification step.

**Roadmap alignment:** This is the M1 “Statement Ingestion MVP” foundation (usable by you + wife). No categories or analytics yet—just clean, deduped history across all uploaded statements.

## Scope

- Take sanitized rows from the parsing pipeline (Spec 0) and attach transaction identifiers (Spec 1).
- Store transactions across many statement uploads.
- Detect duplicates across all statements and require explicit user confirmation before merging.
- Provide data that can be grouped by month for UI display.
- Target user model for M1: single household (you + wife) with one logical `user_id`/household; multi-account/multi-user modeling comes later.

## Inputs (from parser)

For each uploaded statement we receive:
- `statementMetadata`: source file name, hash, page count, inferred account/bank (if available), statement period (start/end, timezone), currency, uploadedBy, uploadedAt.
- `rows`: array of `[date, description, amount, balance?]` already sanitized.
- `defaultYear`: derived from statement period for date normalization.
- `statementType`: bank vs credit card.

## Data Model (proposed)

**statements**
- `id` (uuid, pk)
- `source_file_name`
- `source_file_sha256` (for idempotency; same hash → treat as re-import of same file)
- `bank` / `account_name` / `account_last4` (nullable until we add account linking)
- `statement_type` (`bank` | `credit_card`)
- `period_start` / `period_end` (date)
- `timezone` (IANA)
- `currency`
- `uploaded_by` (user id)
- `uploaded_at` (timestamp)
- `status` (`parsed` | `ingesting` | `ingested` | `failed`)

**transactions**
- `id` (uuid, pk)
- `user_id` (owner)
- `statement_id` (fk → statements.id)
- `transaction_identifier` (string, unique per `user_id` to dedup across all statements)
- `date` (date)
- `month_bucket` (`YYYY-MM`, derived, indexed for grouping)
- `description` (sanitized)
- `amount` (decimal)
- `balance` (decimal, nullable for credit card)
- `statement_page` / `line_number` (optional for traceability)
- `status` (`active` | `voided`)
- `created_at`

**transaction_imports** (staging the current upload)
- `id` (uuid)
- `statement_id`
- `transaction_identifier`
- `resolution` (`pending` | `accepted` | `rejected`)
- `existing_transaction_id` (nullable; points to prior record when duplicate detected)
- `notes` (optional reason when user rejects)
- `created_at`

Indexes:
- Unique constraint on (`user_id`, `transaction_identifier`) in `transactions`.
- Index on `month_bucket` for grouping queries.
- Index on `statement_id` in both tables.

## Ingestion Flow

1) **Upload & parse** (existing): user uploads PDF → parser returns sanitized rows + metadata.
2) **Create statement record**: insert into `statements` with file hash; if a statement with the same file hash and user exists, short-circuit to a “already imported” state.
3) **Stage transactions**:
   - For each row, compute `transaction_identifier` (Spec 1), derive `month_bucket`, and insert into `transaction_imports` with `resolution=pending`.
4) **Dedup check**:
   - Look up `transactions` by (`user_id`, `transaction_identifier`).
   - If none: mark staging row as `pending` with `existing_transaction_id=null`.
   - If found: link `existing_transaction_id`, keep `resolution=pending`, and do **not** alter the existing record.
5) **User confirmation UI** (see below):
   - User can accept all non-duplicates in bulk.
   - For duplicate candidates, user chooses per row:
     - **Keep existing** (default): set staging `resolution=rejected` (or mark as “skipped as duplicate”); existing transaction untouched.
     - **Accept anyway**: insert a new `transactions` row (rare; only when identifier collision was wrong) and set `resolution=accepted`. No deletions/overwrites allowed.
6) **Commit**:
   - Move accepted rows from `transaction_imports` into `transactions`.
   - Update `statements.status` to `ingested`.
   - Keep `transaction_imports` history for audit.

## Duplicate Handling Rules

- Never delete or overwrite an existing `transactions` row.
- Default behavior for a duplicate is “keep existing, skip new.”
- Only user action can create a new row when a duplicate is detected; this guards against silent collisions.
- Re-upload of the **same file** (same `source_file_sha256`) should short-circuit: do not re-stage rows unless the user explicitly requests re-ingest.

## Multi-Statement Support

- Each upload is a new `statement` record, even if periods overlap.
- Dedup scope is **user-wide**, not statement-wide; this prevents duplicates across overlapping periods.
- Keep `statement_id` on every transaction for traceability (which statement it came from).

## Month Grouping Requirement

- Store `month_bucket` as `YYYY-MM` (derived from normalized transaction date + statement timezone).
- Query pattern for UI: `SELECT ... FROM transactions WHERE user_id=$1 ORDER BY date DESC`, grouped by `month_bucket`.
- Ensure timezone normalization so that late-night transactions don’t slip into the wrong month.

## UI Expectations (aligned to M1)

- After upload: show statement summary (period, currency, transaction count, bank/account if known).
- **Review screen**:
  - Section A: “New transactions” (no duplicates), grouped by `month_bucket`, with a single “Accept all new transactions” action.
  - Section B: “Potential duplicates” showing existing vs new side by side; default action “Keep existing (skip new)”, optional “Add as new anyway”.
   - **Delete Import**: Option to completely reject/delete the statement and its pending transactions (for incorrect uploads).
   - Finalize/commit button to move accepted rows into `transactions` and mark statement `ingested`.
   - **Duplicate Safety**: The commit process uses `ON CONFLICT DO NOTHING` (graceful handling) to prevent crashes if a transaction already exists in the destination table.

- **Transactions Page** (Main View):
   - Displays real data fetched from `transactions` table.
   - **Traceability**: Each transaction has a "Source" link (e.g., "DBS (Sep 2024)" or `filename.pdf` if bank is unknown) pointing to the statement context.
   - **Filtering**:
     - Filter by Month.
     - Filter by specific **Statement** (Source) within that month.
   - **Visuals**: Expenses shown in neutral color (not green), positive sum for "Total Spent".
- Progress states: parsing → staging → awaiting review → ingested (or deleted). Keep these visible in the UI.

## Validation & Safety

- Run existing sanitization (Spec 0) before staging.
- Reject ingestion if required metadata is missing: statement period, timezone, currency.
- Log but do not surface raw statement text.
- Consider PCI-adjacent check on descriptions (already covered in sanitization).

## Out of Scope (for this spec)

- LLM classification, merchant normalization, categories (M2).
- Budgets, charts/graphs, category summaries (M3).
- Multi-currency support.
- Sophisticated account/household permissions (attach everything to one household/user for now).

## Success Criteria (M1)

- Upload all known PDFs, review, and commit without creating duplicates.
- Re-uploading the same file (same hash) does not stage or create duplicates.
- Overlapping statement periods do not create duplicates (identifier works).
- The UI clearly separates new transactions from potential duplicates and supports one-click accept for new rows.

## Roadmap Note

See `docs/ROADMAP.md` for milestones. This spec is the M1 “Statement Ingestion MVP” slice; M2 adds classification/enrichment, M3 adds spending insights, M4 adds hybrid inputs and fuller account handling.

## Open Questions

- How do we capture account identity (user-entered vs parsed) to scope dedup when multiple accounts exist?
- Should we block ingestion if the statement period overlaps with an already-uploaded statement from the same account, or just rely on identifiers?
- Do we need soft-delete/void semantics for transactions later, and how does that interact with duplicates history?

---

## Implementation Notes

### Database: Supabase (Postgres)

The data model is implemented using Supabase with the following:

**Migration file:** `supabase/migrations/20251205000001_create_statements_and_transactions.sql`

**Key implementation details:**
- All IDs are UUIDs using `uuid-ossp` extension
- Enums defined for: `statement_type`, `statement_status`, `import_resolution`, `transaction_status`
- Automatic `updated_at` trigger on all tables
- Cascade deletes: deleting a statement removes associated transactions and imports
- Default timezone: `Asia/Manila` (Philippines)
- Default currency: `PHP`

**TypeScript types:** `lib/supabase/database.types.ts`
- Manually maintained for now; can be auto-generated via `npx supabase gen types typescript`

**Client setup:** `lib/supabase/client.ts`
- `supabase` - client-side instance (anon key)
- `createServerClient()` - server-side instance (service role key for admin ops)

### Environment Variables

Required in `.env.local` (see `.env.example`):
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start>
```

### Local Development

```bash
# Start local Supabase (runs Postgres, Auth, Storage, etc.)
npx supabase start

# Apply migrations
npx supabase db reset

# View local dashboard
# http://127.0.0.1:54323

# Stop when done
npx supabase stop
```

### Future: Row Level Security (RLS)

RLS is enabled from day one in the migration:
- **`statements`**: users can only CRUD their own (`uploaded_by = auth.uid()`)
- **`transactions`**: users can only CRUD their own (`user_id = auth.uid()`)
- **`transaction_imports`**: access controlled via statement ownership (subquery check)

This ensures data isolation even in M1 single-household mode, and is ready for multi-user expansion.
