# Project Progress Log

## 2025-12-07: Initial Progress Log Update

**Current Status**: M1 — Statement Ingestion MVP (Implementation Phase)

We are currently building the foundation for the "Statement Ingestion MVP". The core parsing logic and transaction identification modules are in place, and the frontend skeleton is set up.

### Recent Accomplishments
- **Core Pipeline**:
    - Implemented `lib/transaction-identifier.ts`: Generates deterministic unique IDs for transactions based on date, amount, balance, and description hash.
    - Implemented PDF parsing logic (DBS/UOB support) in `lib/pdf` (inferred from file structure and git logs).
- **Architecture**:
    - Initialized Next.js project with Supabase (v5).
    - Created design system foundations (`globals.css`, fonts, layouts).
    - Established detailed specifications in `docs/specs`.
- **UI/UX**:
    - Built the initial shell for the application (`app/layout.tsx`, `app/page.tsx`).
    - Added branding guidelines in `docs/brand`.

### Current Focus
- Integrating the PDF parsing backend with the frontend upload interface.
- Implementing the "Review Screen" to allow users to verify and verify transactions before committing them to the database.


### Next Steps
1. **Frontend Integration**: connect the file upload component to the API route that handles parsing.
2. **Database Schema**: Verify Supabase tables (`statements`, `transactions`, `transaction_imports`) match `docs/specs/2-transaction-storage-dedup.md`.
3. **End-to-End Test**: Perform a full test of uploading a PDF -> Parsing -> ID Generation -> Displaying results.

## 2025-12-07: PDF Ingestion & Review Polish (Session 2)

**Current Status**: M1 — Statement Ingestion MVP (Refining & Bug Fixing)

We successfully debugged the PDF ingestion pipeline and polished the review workflow, ensuring that data is parsed correctly and users have full control over the import process.

### Recent Accomplishments
- **Bug Fixes (PDF & Dates)**:
    - Resolved `pdf is not a function` error by fixing library imports.
    - **Critical Fix**: Updated date parsing logic to infer the year from the PDF text (e.g., "Sep 2024") instead of defaulting to the current year or 2001. This resolved the "Year 2025" issue.
    - Updated `lib/db/ingest.ts` and `app/api/statements/ingest/route.ts` for robust error handling and logging.
- **Review Workflow Improvements**:
    - Implemented **"Delete Import"** functionality in the Review Page.
    - Added a confirmation modal (`window.confirm`) to prevent accidental deletions.
    - Backend now correctly cleans up (cascading delete) when a statement is rejected, allowing for immediate re-uploads.
- **Duplicate Handling**:
    - Validated that duplicate statements are detected and can be cleaned up via the new delete function.

### Next Steps (Tomorrow)
1. **Recent Imports Status**: Update the dashboard/list to accurately reflect statement status (e.g. "Reviewing" vs "Confirmed"). currently, clicking an unconfirmed statement incorrectly shows a mock Transactions view.
2. **Real Transaction Data**: Connect the Transactions page to the actual database (`transactions` table) instead of mock data.
3. **Traceability**: Add a "Statement Identifier" column/link to the Transactions table, allowing users to trace a transaction back to its source statement.

## 2025-12-08: Real Data, Filtering & Preparation for M2 (Session 3)

**Current Status**: M1 — Statement Ingestion MVP (Complete)

We finalized the M1 milestone by connecting the frontend to real database data, refining the transaction filtering, and polishing the UI. We also laid the groundwork for the next major phase: Categorization.

### Recent Accomplishments
- **Real Data Integration**:
    - Dashboard and Transactions pages now fetch live data from Supabase.
    - Transaction "Total Spend" calculation corrected (sums positive amounts).
- **Refined Filtering**:
    - Implemented **Statement-level filtering** within the Transactions page. Users can now drill down to specific statements (e.g. "DBS Sep 2024").
    - "Unknown" statement names now fallback to the **PDF filename**, solving the "Unknown Bank" issue.
- **Traceability & Safety**:
    - Added clickable source links in the transaction table.
    - **Critical Fix**: Implemented robust duplicate handling. The system now gracefully ignores existing transactions during import instead of crashing.
- **Documentation**:
    - Standardized all Specification docs (`0`, `1`, `2`, `3`) with a consistent "Changelog" format.
    - Created `docs/specs/3-categorization-and-onboarding.md` detailing the plan for the next phase.

## 2025-12-08: Transaction Exclusion & Tagging Improvements (Session 4)

**Current Status**: M1.5 — Refinements

We addressed user feedback on the exclusion logic, generalizing "Payments" to a broader "Excluded" status to handle duplicates, internal transfers, and payments uniformly. We also significantly improved the Tagging UI stability.

### Recent Accomplishments
- **Transaction Exclusion**:
    - **Database Migration**: Renamed `is_payment` -> `is_excluded` and added `exclusion_reason`.
    - **UI**: Implemented an "Eye" toggle for exclusion.
    - **UX**: Added a popover to capture optional reasons (e.g., "Duplicate") when excluding.
    - **Logic**: Updated "Total Spend" to respect the `is_excluded` flag.
- **UI/UX Polish**:
    - **Tagging**: Moved to an explicit loading state (locking the row) instead of Optimistic UI to prevent data sync issues.
    - **Performance**: Implemented "Silent Refetching" to update totals without triggering global loading spinners.

### Next Steps (From Wishlist)
1. **Upload Multiple Files**: Enhancing the ingestion flow to handle batch uploads.
2. **Statement Management**: Create a dedicated view to list, manage, and delete statements.
3. **Categories**: Proceed with the categorization implementation (M2).

## 2025-12-09: Statement Management (Session 5)

**Current Status**: M1.5 — Refinements (Statement Management Added)

We implemented the dedicated Statement Management features, allowing users to view, audit, and delete uploaded statements from a central interface.

### Recent Accomplishments
- **Statement Management Pages**:
    - **List View**: Created `/statements` to list all uploaded files with their status (Parsed, Reviewing, Ingested).
    - **Detail View**: Created `/statements/[id]` to show specific metadata and transaction lists for a single statement.
    - **Deletion**: Implemented cascading delete functionality accessible from both list and detail views.
- **Navigation**:
    - Added "Statements" to the main navigation header for quick access.

### Next Steps
1. **Testing**: Perform thorough manual or automated testing of the new pages (deferred due to time constraints).
2. **Category Rules**: Begin implementation of categorization logic (M2).

## 2026-01-18: Auth & Landing Page (Session 6)

**Current Status**: M1 → Public-ready shell

Shifted from "dev tool for me" to "private workspace" per Spec 5.

### Recent Accomplishments
- **Auth (Spec 5)**:
    - Landing page at `/`, login at `/login` (email + 6-digit OTP), dashboard moved to `/upload`.
    - `middleware.ts` enforces auth redirects and session refresh via `@supabase/ssr`.
    - E2E bypass: `test-*@…` + OTP `111111` works in non-production to unblock Playwright without real inboxes.
- **Parsing tweaks**: Minor improvements to the existing `pdf-parse`-based extractor (commit: "Add auth, landing page, and improve parsing").

## 2026-01-20: Review Refinements & Security Bump (Session 7)

**Current Status**: M1.5 — Review UX overhaul

Addressed user feedback on the review screen (Specs 6 + 6-revision) and patched a Next.js CVE.

### Recent Accomplishments
- **Review screen overhaul (Spec 6 + 6-revision)**:
    - Removed the "Potential Duplicates" section — duplicates are now silently skipped at commit via `ON CONFLICT DO NOTHING`.
    - Inverted the interaction model: every row is selected by default with a checkbox; unchecking marks for exclusion (was previously "click minus to exclude").
    - Date-grouped list with sticky date headers.
    - Sticky footer with `Confirm Import` + `Delete Import` so the primary action is always visible.
    - Re-enabled the Tags column in the Transactions view (stays off in Review via `enableTagging={false}`).
- **Exclusion persistence**: `transaction_imports` got `is_excluded` + `exclusion_reason` columns (migration `20260120000001`) so review-time exclusions survive the commit hop.
- **Security**: Bumped Next.js to 16.1.4 for CVE-2025-66478.

## 2026-01-25: Transactions RSC Refactor & E2E Stabilization (Session 8)

**Current Status**: M1.5 — Architecture cleanup

Migrated the transactions page to the RSC-first pattern the rest of the app was drifting toward, and shored up the E2E auth flow.

### Recent Accomplishments
- **Transactions page → RSC + Server Actions + optimistic UI**:
    - `app/transactions/page.tsx` now fetches month/statement data server-side via `refreshTransactionData` (composite Server Action) and hands initial data to the client component.
    - Client component `components/transactions-view.tsx` uses optimistic mutations for tags and exclusion, with silent revalidation instead of global spinners.
    - Fixed a bug where the transactions API was being re-triggered on every client render.
- **Auth**:
    - Fixed magic-link URL generation (`getURL()` helper now produces a correct absolute URL for email templates).
    - Added Playwright E2E for login (`tests/e2e/login.spec.ts`) using the `test-*` backdoor.

### Next Steps
1. **M2 preparation**: Decide whether AI categorization should write `tag_id`s against the existing tags table or introduce a parallel `ai_category` field. Lean toward the former.
2. **Tag management UI**: No dedicated page exists today; tags are created inline but can't be renamed, merged, or deleted from the app.
3. **Currency consolidation**: `statements.currency` (defaults to `PHP` in migration, `SGD` in `ingest.ts`, `SGD` via `user_settings`) is currently contradictory — reconcile before multi-currency work.

## 2026-04-19: Parser commit + cache fix + AI auto-tag + /insights (Session 9)

**Current Status**: M2 partial (AI categorisation shipped) + M3 v0 (insights page shipped).

A single end-to-end push that took the app from "M1 shipped, but…" to a fully working categorisation + insights loop. Six commits, all on `main`, none pushed.

### Recent Accomplishments

- **Parser rewrite committed** (`af74630`): the `pdfjs-dist` + word-coord layout pipeline that had been sitting on the working tree since Session 8 is now in history. 48 unit tests pass cleanly. Spec 0 v3 + Spec 6-revision are the source of truth.
- **Vitest config** (`1274a98`): added `vitest.config.ts` excluding `tests/**` so Playwright specs no longer leak into vitest discovery.
- **Cache invalidation fix** (`50c7f05`, the user's explicit ask): every Server Action now `revalidatePath`s the surfaces it affects. The "delete statement doesn't refresh" / "import doesn't show up" class of bug is gone. Rule is documented in `CLAUDE.md` so future actions don't regress. Same commit also folded in: hardcoded redirect fix (`?month=2025-12` → derived from `period_end`), `mapDBStatementToUI` helper centralising the duplicated mapper, deletion of `lib/services/{statement-service,mock-data}.ts` (zero callers — the upload flow's `uploadStatement` is now inlined in `lib/hooks/use-statement-upload.ts`), and `lib/types/insights.ts` + `lib/categorize/types.ts` pre-work.
- **RSC migration of `/upload` and `/imports/[id]/review`** (`2e55acc`): both pages were `'use client'` with `useEffect` fetches. Now async RSC + thin client child for mutations only. New `components/upload-view.tsx` and `components/review-view.tsx`. `lib/hooks/use-statement-review.ts` deleted.
- **AI tagging on ingest** (`a88240b`): full pipeline. New schema (`20260419000001_imports_suggested_tags.sql`) adds `suggested_tag_ids`, `ai_suggestion_status` (`pending|completed|failed|skipped|disabled`), `ai_model_version`, `ai_suggested_at` to `transaction_imports`; `auto_tag_enabled` + monthly budget tracking on `user_settings`; `is_primary` on `transaction_tags` with a unique partial index. New `lib/categorize/` module: Anthropic SDK client (`claude-haiku-4-5`), prompt builder with cache control, budget check/increment with monthly rollover, p-limit concurrency cap. Wired via Next.js `after()` in the ingest API route — never blocks upload UX. Review screen polls every 1.5s while pending; `components/suggestions-panel.tsx` renders dashed-outline pills with click-to-accept / X-to-dismiss. `confirmStatementImport` resolves new `transactions.id` by `(user_id, transaction_identifier)` after insert and batch-upserts `transaction_tags` with the first accepted tag marked `is_primary`. One-time AI disclosure banner on `/upload`.
- **`/insights` page** (`b5f8154`): replaces the "Coming in M3" placeholder. Single page with `[Statement | Month | Year]` segmented toggle. New `getInsights(period)` Server Action aggregates by primary tag (no more even-splitting amounts across multi-tag transactions) and by exact merchant string. RSC defaults to the latest month with data; client view persists the last selection in `localStorage`. `/summary` becomes a redirect to `/insights`. Nav renamed.

### Verification
- `npm run test:run`: 53/53 ✅
- `npm run build`: clean ✅
- `npx supabase db reset`: applies all 9 migrations including the new one ✅
- Type regen + helper aliases re-appended to `lib/supabase/database.types.ts` ✅

### Out of scope / deferred
- Tag management UI (`/tags` rename/merge/delete) — Track C.
- Settings page — Track C; `auto_tag_enabled` and budget are DB-editable only.
- Insights commentary / MoM trends / charts — separate spec.
- Currency consolidation across schema (still `'SGD'` fallback).
- Merchant normalization (`GRAB*RIDE` variants → `Grab`) — M2 follow-up.

## 2026-04-19: AI provider swap → perf → on-demand hybrid suggestions (Session 10)

**Current Status**: M2 reshaped — categorisation is now on-demand, not at ingest. Suggestion quality improves with usage rather than depending on a pre-built reference.

Five commits, on top of Session 9. Architecture changed twice in one session as the constraints became clearer.

### Recent Accomplishments

- **OpenAI swap** (`65eee3a`): replaced `@anthropic-ai/sdk` (claude-haiku-4-5) with `openai` (gpt-4o-mini). Same prompt + tool-use contract. Reads `OPEN_AI_API_KEY` (with `OPENAI_API_KEY` fallback). Pricing constants + cache-token field updated for OpenAI's `prompt_tokens_details.cached_tokens` shape.
- **Perf pass on the (then still-existing) ingest-time tagger** (`3315373`): batches were sequential and per-row UPDATEs were serial PostgREST round-trips. Switched to parallel batches with a `p-limit(4)` cap and a new `apply_import_suggestions(payload jsonb)` RPC for single-roundtrip writes. Batch size 50→25 for faster TTFT. Roughly 4× faster wall-time for ~100-row statements.
- **Architecture pivot — on-demand hybrid suggestions** (`6b5b022`): scrapped the after-hook ingest-time LLM tagger entirely. New `lib/suggest/` module:
  - **pgvector + HNSW** on `transactions.description_embedding` (1536-dim, `text-embedding-3-small`). New `knn_neighbour_tags` RPC returns top-K similar tagged transactions in one trip with their tags joined as JSONB.
  - **Hybrid suggester**: KNN-only when ≥3 strong neighbours (sim ≥ 0.75); else falls back to **gpt-5.4-nano** with weak KNN hits as few-shot examples and the user's locale ("user from Singapore…"). Cost trajectory inverts usage — every manual tag becomes a free reference for future suggestions.
  - **Hierarchy collapse** drops ancestors when a descendant is also suggested (Coffee wins over Food, transitively).
  - **TagInput on /transactions** fetches suggestions on first popover open; renders dashed-pill suggestions with Sparkles icon. Click → applies; X → dismisses.
  - **Embed-on-commit**: `confirmStatementImport` embeds just-promoted rows so KNN works the first time. `backfillTransactionEmbeddings` server action covers existing data.
  - **Tear-down**: deleted `lib/categorize/` entirely, `components/suggestions-panel.tsx`, the `after()` hook, polling/state in review-view, `getSuggestionsForStatement`, `ImportSuggestion` type, plus the staging-row AI columns from Session 9 (`suggested_tag_ids`, `ai_suggestion_status`, `ai_model_version`, `ai_suggested_at`) and the `apply_import_suggestions` RPC.
  - Re-added `country` on `user_settings` (wired through onboarding) for LLM locale context.
- **Multi-tag bug fix** (`bd861b1`): `is_primary` defaults to `true` and a unique partial index allows only one primary per transaction. `assignTagsToTransaction` was inserting all tags with the default → second insert failed `idx_transaction_tags_one_primary`. Fix: explicit `is_primary: i === 0`. Also stopped the TagInput popover from slamming shut after every selection so users can stack tags in one open.
- **Country codes in embeddings** (`4d098f2`): `normalize` regex was stripping `SG`/`JP`/`HK`/etc. before embedding, collapsing "AMAZON JP" and plain "AMAZON" to the same vector — so KNN couldn't learn locale-anchored patterns no matter how many JP transactions the user tagged. Reverted that strip; country codes carry signal. Added a `Refresh AI` button (top-right of /transactions) that calls `backfillTransactionEmbeddings({ force: true })` to re-embed everything when the normalization rules change.

### Verification
- `npm run test:run`: 65/65 ✅ (added `lib/suggest/__tests__/normalize.test.ts` with 10 cases + `suggest.test.ts` with 7 hierarchy-collapse cases)
- `npm run build`: clean ✅
- New migrations applied via `npx supabase migration up --local` (no `db reset` — preserves data):
  - `20260419000003_pgvector_embeddings.sql` — pgvector extension, embedding column + HNSW index, `country` on user_settings, drops Session 9's after-hook AI columns/RPC
  - `20260419000004_knn_neighbour_tags_rpc.sql` — KNN helper function

### Architectural notes for future sessions
- **No external seed data**: explicitly rejected (Foursquare OS Places, MCC codes, OSM Overpass, HF labeled datasets, pretrained classifiers). The LLM cold-start covers the first ~10 transactions; KNN takes over once the user has tagged enough that strong neighbours exist. Quality compounds with use.
- **Vitest config** now includes a `@/` path alias matching `tsconfig.json` (`vitest.config.ts`) — needed for `lib/suggest/normalize.ts` to import `@/lib/pdf/types`.
- **Embedding staleness**: any change to `normalizeForEmbedding` invalidates existing embeddings. The `Refresh AI` button is the recovery path; flag it in any future PR that touches `lib/suggest/normalize.ts`.

### Out of scope / deferred (still)
- Tag management UI (`/tags`) — Track C.
- Settings page (budget adjustment, country change, auto-tag toggle) — Track C; all are DB-editable only.
- Insights commentary / MoM trends / charts.
- Currency consolidation.
- Merchant normalization for top-merchant aggregation.
- Pre-seeded merchant dictionaries — see "no external seed data" decision above.
- Local sentence-transformers / pretrained DistilBERT classifiers — adds infra without enough quality win.

## 2026-04-19: Tag embeddings + lowercase tags + country expansion (Session 11)

**Current Status**: Suggestion quality for zero-shot cases addressed. Tags now live in the same semantic space as transactions, and a case-folded vocabulary kills the `Japan`/`japan` split.

Problem that kicked this off: `MOBILE ICOCA OSAKA JP …` got no `japan`/`travel` suggestions even though the signal was obvious. Root cause was that tags were invisible to semantic search — we had transaction embeddings but nothing to compare them against besides the user's prior tagged transactions (KNN), which is empty on a cold start.

### Recent Accomplishments

- **Lowercase-tag migration** (`20260419000005_lowercase_tags.sql`): folds case-duplicate pairs per user (winner = earliest created; loser's `transaction_tags` repointed; `is_primary` preserved with a two-step delete-then-promote to satisfy `idx_transaction_tags_one_primary`; `tag.parent_id` references repointed before the loser delete so the FK holds). Lowercases all remaining names and adds `tags_name_lowercase_chk` so future inserts can't drift. Server-side `normalizeTagName` in `app/actions/tags.ts` lowercases at the boundary too (defence-in-depth).
- **Tag embeddings** (`20260419000006_tag_embeddings.sql`): adds `tags.description` (text, nullable) and `tags.embedding vector(1536)`, HNSW index on embedding, and the `knn_nearest_tags(user_id, embedding, limit)` RPC. `lib/suggest/embed.ts` gains `composeTagEmbedText(name, description)` + `embedTags(supabase, ids)` mirroring `embedTransactions`. Composed text flows through `normalizeForEmbedding` so tag and transaction vectors share one space (country expansion, uppercasing, stopword stripping all consistent).
- **LLM auto-seed for tag descriptions**: `lib/suggest/seed-tag-description.ts` asks the model for 1–2 lines of comma-separated cues (country codes, currencies, merchant names, transaction verbs — no prose) on tag creation. `createTag` insert returns immediately; `after(...)` fires the seed → description update → embed chain so the write is snappy and the tag's embedding lands in the background.
- **Three-signal suggestion pipeline** in `lib/suggest/suggest.ts`:
  1. Strong KNN (≥3 neighbours ≥ 0.75) — blended with tag-embed as an additive boost.
  2. Strong tag-embed (≥2 candidates ≥ 0.35) — picks up semantically-obvious tags on first encounter.
  3. LLM fallback — now **unions** tag-embed candidates into its output via `mergeLLMWithTagEmbed` instead of just using tag-embed to relabel overlaps as `'mixed'`. Prevents the "LLM picked `hotels, flights, activities`, dropped `japan` entirely" failure.
  - LLM prompt softened: instead of *"If nothing fits, return an empty array. Never guess."*, it now *"Always return at least 1 tag… pick the closest option in the vocabulary so the user sees a starting point."* Empty output only when the vocabulary is truly unrelated.
- **Country-code expansion in `normalizeForEmbedding`**: `JP` → `JP JAPAN`, `SG` → `SG SINGAPORE`, 20-code whitelist. Conservative — `IT`, `IN`, `ID`, `DE`, `MY` excluded (common English/French tokens). Runs AFTER uppercasing, expands on whole-word boundaries, keeps the raw code so existing KNN hits on bare `JP` still match. Also added a masked-card stripper (`XXXX-XXXX-XXXX-0526` → dropped) since `sanitizeDescription` only handles digit-only PAN patterns.
- **Tag edit dialog** (`components/ui/tag-edit-dialog.tsx`): pencil icon on each tag row in `TagInput` opens a dialog with a description textarea + `Refresh AI` button (calls `generateTagDescription` → reseeds + re-embeds). New `components/ui/textarea.tsx` (shadcn), new server actions `setTagDescription`, `generateTagDescription`.
- **New `source: 'tag-embed'`** added to `TagSuggestion` union for observability in case we ever surface source badges.

### Verification
- `npm run test:run`: 66/66 ✅ (new `normalize.test.ts` cases for country expansion + masked-card stripping + `OSAKA JP` case).
- `npm run build`: clean ✅
- `npx tsc --noEmit`: clean ✅
- `npx supabase db reset`: applies all 14 migrations including the two new ones ✅.
- Regenerated `lib/supabase/database.types.ts` with the helper-type aliases re-appended (the Supabase gen command prints `Connecting to db 5432` to stdout — must redirect stderr).

### Architectural notes for future sessions

- **Embeddings now live on both sides**: changing `normalizeForEmbedding` invalidates *both* transaction and tag embeddings. Still-relevant `Refresh AI` button re-embeds transactions; tag-side recovery is the per-tag `Refresh AI` inside the edit dialog (regenerates description then re-embeds). A future "rebuild all tag embeddings" admin action would be cheaper than per-tag clicks if this becomes frequent.
- **Country expansion map is deliberately conservative**: skipping `MY/IT/IN/ID/DE` avoids false positives on common prepositions and pronouns that happen to be ISO codes. Adding more codes is cheap; the cost is false-positive pollution, not index size.
- **`after()` callbacks in server actions**: `createTag` uses Next 16's `after(...)` from `next/server` for the seed+embed chain so the user gets the new tag back immediately. The Supabase SSR client stays in scope; no need for service-role.
- **`is_primary` invariant during the lowercase merge**: we couldn't simply `UPDATE` both loser and winner to primary — the partial unique index blocks two primaries on the same transaction even transiently. Two-step sequence: delete loser, then promote winner.
- **Tag-embed threshold calibration**: `TAG_EMBED_STRONG_SIMILARITY = 0.35` and `TAG_EMBED_MIN_SIMILARITY = 0.30` are eyeballed. Tag-text (name+description) vs merchant-text has a different register than merchant-vs-merchant, so absolute scores run lower than KNN's `0.75`. Revisit once we have real usage data.

### Out of scope / deferred (still)
- Dedicated `/tags` management page — tag editing now lives inside `TagInput`; a standalone page is still useful for bulk rename / merge / delete.
- Bulk-rebuild server action for tag embeddings (covers cases where many tag names or `normalizeForEmbedding` rules change at once).
- Source badges on the suggestion pills (`'knn' | 'tag-embed' | 'llm' | 'mixed'` is available in the payload but not rendered).
- Tag-embed threshold auto-calibration from observed acceptance rates.
