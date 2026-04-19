# Transaction Storage & Deduplication — Spec (v0.3)

## Changelog

| Date | Author | Description |
| :--- | :--- | :--- |
| 2026-04-19 | ebertulfo | v0.3: Add tags, user_settings, exclusion columns on imports. Remove "Potential Duplicates" review UI (silent skip per Spec 6). Reconcile timezone/currency defaults. |
| 2025-12-08 | ebertulfo | v0.2: M1 features (Transactions page, filename fallback, duplicate safety) |
| 2025-12-05 | ebertulfo | Initial draft |

## Objective

Persist extracted transactions from many statements without losing history, while preventing silent overwrites of duplicates. Data is the source of truth for the Transactions page, Statement Management, and later enrichment steps.

**Roadmap alignment:** This is the shipped M1 "Statement Ingestion MVP" foundation.

## Scope

- Take sanitized rows from Spec 0 and attach identifiers from Spec 1.
- Store transactions across many statement uploads.
- Detect duplicates across all user transactions. Post-Spec 6, duplicates are **silently skipped** at commit time (no manual "keep existing vs add new" step).
- Provide data that can be grouped by month and filtered by statement for the UI.
- Per-user tagging (replaces the originally-specced `categories` table — see Spec 3 for context).
- Per-user settings (default currency, onboarded flag).

## Inputs (from parser — Spec 0)

For each uploaded statement we receive:
- `statementMetadata`: `source_file_name`, `source_file_sha256`, inferred account/bank, statement period (start/end), currency.
- `rows`: `[Date, Description, Amount, Balance, Identifier]` — already sanitized, identifier attached.
- `inferredYear` (via `ParsedTable.metadata.inferredYear`) — propagated into identifier generation.

## Data Model (implemented)

Migrations live under `supabase/migrations/` and all user-data tables have RLS enabled.

### `statements`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid, pk | |
| `source_file_name` | text | |
| `source_file_sha256` | text | Unique per `uploaded_by` — idempotency key |
| `bank` / `account_name` / `account_last4` | text (nullable) | |
| `statement_type` | enum (`bank`, `credit_card`) | |
| `period_start` / `period_end` | date | |
| `timezone` | text, default `Asia/Manila` | See "Currency & timezone" below |
| `currency` | text, default `PHP` in migration | Override: `ingest.ts` currently forces `SGD` when metadata omits currency |
| `uploaded_by` | uuid | |
| `status` | enum (`parsed`, `ingesting`, `ingested`, `failed`) | |
| `uploaded_at` / `created_at` / `updated_at` | timestamptz | |

Unique index: `statements_user_file_hash_idx (uploaded_by, source_file_sha256)`.

### `transactions`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid, pk | |
| `user_id` | uuid | |
| `statement_id` | uuid, fk → `statements(id)` cascade | |
| `transaction_identifier` | text | Unique per `user_id` for dedup |
| `date` | date | |
| `month_bucket` | text (`YYYY-MM`) | Indexed |
| `description` | text | Sanitized |
| `amount` | decimal(15,2) | Signed per Spec 0 profile convention |
| `balance` | decimal(15,2), nullable | Nullable for credit cards |
| `statement_page` / `line_number` | int, nullable | Traceability |
| `status` | enum (`active`, `voided`) | |
| `is_excluded` | boolean, default false | Renamed from `is_payment` in migration `20251208000006` |
| `exclusion_reason` | text, nullable | Added alongside the rename |
| `created_at` / `updated_at` | timestamptz | |

Indexes: unique `(user_id, transaction_identifier)`; `(user_id, month_bucket)`; `(statement_id)`; `(user_id, date desc)`.

### `transaction_imports` (staging)
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid, pk | |
| `statement_id` | uuid, fk cascade | |
| `transaction_identifier` | text | |
| `date` / `month_bucket` / `description` / `amount` / `balance` | — | Same types as `transactions` |
| `resolution` | enum (`pending`, `accepted`, `rejected`) | |
| `existing_transaction_id` | uuid, nullable | Populated when a matching identifier already exists |
| `notes` | text, nullable | |
| `is_excluded` | boolean, default false | Added in migration `20260120000001` — needed so Review-time exclusion survives commit |
| `exclusion_reason` | text, nullable | Added in the same migration |
| `created_at` | timestamptz | |

### `tags` + `transaction_tags`
Introduced by migration `20251208000000_tags_and_payments.sql`. Replaces the originally-planned `categories` table (see Spec 3 for the rationale).

`tags`: `id`, `user_id`, `name` (unique per user), `parent_id` (self-ref for hierarchy, unused in UI today), `color`, `created_at`.

`transaction_tags`: junction table with composite pk `(transaction_id, tag_id)`, both cascade-deleted.

RLS: tags scoped by `user_id`; `transaction_tags` access gated via subquery on `transactions.user_id`. Two policy fixes (`20251208000004`, `20251208000005`) hardened the junction-table policy.

### `user_settings`
Migration `20251208000003`. Primary key is `user_id` (1:1 with `auth.users`).

| Column | Type | Notes |
| :--- | :--- | :--- |
| `user_id` | uuid, pk, fk `auth.users(id)` cascade | |
| `currency` | text, default `SGD` | Set by the onboarding wizard from country selection |
| `created_at` / `updated_at` | timestamptz | |

Presence of a `user_settings` row is the onboarding-completion signal.

## Ingestion Flow (shipped)

1. **Upload & parse** — `POST /api/statements/ingest` runs the extractor from Spec 0.
2. **File-hash dedup** — `ingest.ts` hashes the buffer with SHA-256 and short-circuits if `(uploaded_by, source_file_sha256)` already exists, returning the existing statement id + `isDuplicate: true`.
3. **Create `statements` row** — status `ingesting`.
4. **Stage rows** — for each parsed row, insert into `transaction_imports` with `resolution='pending'`, identifier, and derived `month_bucket`.
5. **Mark candidate duplicates** — for each staged row, look up `(user_id, transaction_identifier)` in `transactions`. If found, set `existing_transaction_id`.
6. **Review** — user visits `/imports/[statementId]/review`. Post-Spec 6:
   - Only non-duplicate rows are displayed (grouped by date, newest first, sticky date headers).
   - Each row has a selection checkbox; default is selected.
   - Unchecking a row writes `is_excluded=true` on the matching `transaction_imports` row (via `updateTransactionExclusion`, which transparently targets imports or transactions depending on which table holds the id).
   - Sticky footer offers **Confirm Import** and **Delete Import**.
7. **Commit** — `confirmStatementImport`:
   - Uses `INSERT ... ON CONFLICT (user_id, transaction_identifier) DO NOTHING` when promoting `transaction_imports` rows into `transactions`. Duplicates are silently skipped (not surfaced, not failed).
   - Copies `is_excluded` and `exclusion_reason` into the new `transactions` row.
   - Marks promoted imports as `resolution='accepted'`; unpromoted imports (duplicates or explicitly-rejected rows) get `resolution='rejected'`.
   - Updates `statements.status='ingested'`.
8. **Reject** — user can delete the import entirely from the review screen; cascade deletes the `statements` row, its `transaction_imports`, and any transactions it had promoted.

## Duplicate Handling (current rules)

- Never delete or overwrite an existing `transactions` row.
- Same file (same `source_file_sha256` + user) short-circuits at ingest.
- Same identifier (cross-statement) is silently skipped at commit via `ON CONFLICT DO NOTHING`.
- The old "Potential Duplicates" review section has been removed (Spec 6). Users no longer see per-row "Keep existing / Add anyway" prompts; the system trusts the identifier.
- There is intentionally no way to "add a new row anyway" for an identifier collision. If an identifier collides wrongly, the right fix is to improve the identifier (Spec 1), not to bypass the uniqueness check.

## Multi-Statement Support

- Each upload is its own `statements` row, even on overlapping periods.
- Dedup scope is user-wide across all statements (unique constraint on `user_id, transaction_identifier`).
- `statement_id` stays attached to every transaction for traceability.

## Month Grouping

- `month_bucket` is `YYYY-MM`, derived from the normalized transaction date.
- Primary UI query: `SELECT ... FROM transactions WHERE user_id=$1 [AND month_bucket=$2] [AND statement_id=$3] ORDER BY date DESC`.
- Timezone normalization is handled at `month_bucket` derivation time using `statements.timezone` so late-night transactions don't leak into the next month.

## Currency & Timezone Defaults (known discrepancy)

There are three places currency is set, and they don't agree:

1. **Migration default** (`statements.currency`): `PHP`.
2. **Migration default** (`statements.timezone`): `Asia/Manila`.
3. **Ingest fallback** (`lib/db/ingest.ts`): `SGD` when parser metadata lacks a currency.
4. **User setting** (`user_settings.currency`): defaults to `SGD`, set by the onboarding wizard from country selection.

The user's authoritative currency is `user_settings.currency`. Per-statement `currency` on `statements` is secondary and rarely correct today. A follow-up should either source statement currency from `user_settings` at ingest time, or parse it from the statement text.

## UI Expectations (shipped)

- **Upload** (`/upload`): drag-drop + picker; status states `Parsing → Parsed → Reviewing → Ingested → Failed`.
- **Review** (`/imports/[statementId]/review`):
  - Statement summary card.
  - Date-grouped, sticky-header transaction list, checkbox selection (default selected).
  - Sticky footer: "Importing X transactions (Y excluded)" + Confirm Import + Delete Import.
  - No "Potential Duplicates" section — duplicates are silently skipped at commit.
- **Transactions** (`/transactions`, RSC + Server Actions):
  - Month selector + statement filter.
  - Inline tag assignment via `tag-input` (async mutation with optimistic UI).
  - Exclusion toggle (eye icon) with optional reason popover.
  - "Total Spend" respects `is_excluded`.
  - Clickable source column linking to the statement detail page.
- **Statements** (`/statements`, `/statements/[id]`): list + detail per Spec 4.

## Validation & Safety

- Sanitization from Spec 0 runs before anything is written.
- Ingest rejects rows without `periodStart`/`periodEnd` metadata.
- Raw statement text is never logged.
- RLS is enabled on every user-data table; tags and junction tables are policy-gated via `auth.uid()` subqueries on the owning row.

## Out of Scope

- LLM classification (M2).
- Budgets / charts / insights (M3).
- Multi-currency per user.
- Multi-account modelling beyond the statement-level `account_name`/`account_last4`.

## Success Criteria (M1 — shipped)

- [x] Uploading known PDFs → review → commit produces no duplicates, even across overlapping periods.
- [x] Re-uploading the same file short-circuits without restaging.
- [x] Overlapping statements from different accounts do not collide.
- [x] Review UI is usable for 100+ transactions without scrolling past the commit button.

## Roadmap Note

See `docs/ROADMAP.md`. M1 is complete. M2 (classification/enrichment) currently has a partial stand-in via user-defined **tags** (not AI categories).

## Open Questions

- Currency-of-record consolidation: should `statements.currency` be dropped in favour of `user_settings.currency`, or parsed from the PDF text?
- Account identity: do we model accounts as a separate table once a user has more than 2–3 bank accounts?
- Do we need soft-delete/void semantics on `transactions` (current `status` enum already has `voided` but no code path writes it)?

---

## Implementation Notes

### Database: Supabase (Postgres)

**Migrations (chronological):**

| File | Purpose |
| :--- | :--- |
| `20251205000001_create_statements_and_transactions.sql` | `statements`, `transactions`, `transaction_imports` + enums + RLS |
| `20251208000000_tags_and_payments.sql` | `tags`, `transaction_tags` + initial `is_payment` on `transactions` |
| `20251208000002_fix_rls.sql` | RLS corrections |
| `20251208000003_user_settings.sql` | `user_settings` table |
| `20251208000004_fix_transaction_tags_policy.sql` | Tighten junction-table policy |
| `20251208000005_fix_transaction_tags_policy_robust.sql` | Further policy hardening |
| `20251208000006_rename_is_payment_to_is_excluded.sql` | Rename + add `exclusion_reason` |
| `20260120000001_add_exclusion_to_imports.sql` | Add `is_excluded` / `exclusion_reason` to `transaction_imports` |

**TypeScript types:** `lib/supabase/database.types.ts` (manually maintained; regenerate with `npx supabase gen types typescript`).

**Client setup:** see `lib/supabase/` — three distinct clients (RSC `server.ts`, browser `client.ts`, middleware `middleware.ts`). The service-role helper in `client.ts` is used only by the `/api/statements/ingest` route.

### Local Development

```bash
npx supabase start       # Postgres, Auth, Storage on :54321/:54322/:54323
npx supabase db reset    # Replay migrations from scratch
npx supabase stop
```

### Row Level Security

Enabled from the first migration:
- `statements` — `uploaded_by = auth.uid()`
- `transactions` — `user_id = auth.uid()`
- `transaction_imports` — subquery on `statements.uploaded_by`
- `tags` — `user_id = auth.uid()`
- `transaction_tags` — subquery on `transactions.user_id`
- `user_settings` — `user_id = auth.uid()`
