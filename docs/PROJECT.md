# Gastos Together — Project Overview

> A single-document snapshot of what the app is, what it does, where the code lives, and what's next. Designed to be fed to AI assistants as ground truth. Pair with `CLAUDE.md` (terse rules) and `docs/stupid-simple-spec.md` (product spec) for full context.
>
> _Last updated: 2026-04-28._

---

## 1. What it is

Gastos Together is a household-finance review app for couples. Upload everyone's bank + credit-card PDF statements and get one deduped, categorized, per-person view of where the money went.

It is **not** a chatbot, a budgeting coach, or a daily-logging tool. The wedge is "give us a stack of statements; get a clean monthly answer." That focus is named "KISS" internally and is enforced by `docs/stupid-simple-spec.md` — every feature must map to one of the 6 steps below.

**Brand context:** "Gastos" is a parent brand with sibling apps (iOS, Telegram bot). This repo is the **web app**, branded "Gastos Together," live at `together.gastos.pro`.

---

## 2. The 6-step user flow (Definition of Done)

| Step | What happens | Where in the code |
|---|---|---|
| 1. Upload | User picks PDF(s) on `/upload`. Drag-and-drop. Optional household member tagging. | `components/upload-view.tsx`, `components/upload-dropzone.tsx`, `app/api/statements/ingest/route.ts` |
| 2. Redact | PII stripped (account numbers, addresses, names) before any row hits the DB. | `lib/pdf/types.ts` (`sanitizeDescription`), parser pipeline |
| 3. Extract | Layout-aware PDF parser produces `{date, description, amount}` rows. | `lib/pdf/extract-tables.ts`, `lib/pdf/parser.ts`, `lib/pdf/profiles.ts` |
| 4. Review | User sees staged rows on `/imports/[statementId]/review`. Excludes transfers / CC payments. Reconciliation banner verifies extracted total ≈ printed total. | `app/imports/[statementId]/review`, `components/review-view.tsx`, `app/actions/statements.ts` (`getReviewData`, `confirmStatementImport`) |
| 5. Categorize | AI auto-categorizes during ingest (KNN over user's history, then tag-embed similarity, then LLM). User confirms / overrides on the review screen. Foreign-currency rows auto-flagged as `is_travel`. | `lib/suggest/auto-apply.ts`, `lib/suggest/suggest.ts`, `app/actions/categories.ts` |
| 6. Insights | `/insights` page: by Statement / Month / Year. Drill into a category. Travel toggle. Per-statement member attribution (per-person dimension still pending). | `app/insights/page.tsx`, `components/insights-view.tsx`, `app/actions/transactions.ts` (`getInsights`) |

---

## 3. Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.1.4 (App Router, RSC-by-default, Turbopack) | Renames `middleware.ts` → `proxy.ts` is on the deprecation list — currently still `middleware.ts`. |
| Hosting | Vercel | Custom domain `together.gastos.pro`. Deploys currently driven by `vercel` CLI from local laptop, **not** GitHub auto-deploy (origin/main is far behind disk). |
| DB | Neon Postgres + pgvector | Schema source-of-truth: `db/init.sql`. Drizzle types: `db/schema.ts`. |
| ORM | Drizzle ORM 0.45 (`drizzle-orm/neon-serverless`) | Single client at `lib/db/index.ts`. |
| Auth | Clerk 7.2 | Custom domain `clerk.gastos.pro`. App-level isolation: every read/write must include `eq(table.userId, clerkUserId)`. **No RLS** (Neon doesn't have it; Clerk IDs are `text`). |
| AI | OpenAI: `gpt-5.4-mini` (categorization) + `text-embedding-3-small` (embeddings) | Reads `OPEN_AI_API_KEY` _or_ `OPENAI_API_KEY` from env. |
| Styling | Tailwind v4 + Shadcn UI ("new-york", neutral) | No arbitrary values. Edit Shadcn primitives in place — they're owned. |
| Testing | Vitest (unit, primarily PDF parser) + Playwright (E2E) | `tests/private/*.pdf` — real bank statements, gitignored. |

React is pinned at 19.2.5 to satisfy Clerk's peer.

---

## 4. Architecture

### Server/Client boundary

**RSC by default.** Every page in `app/` is a Server Component. Data flows in via Server Actions (`app/actions/*.ts`); Client Components live at the leaves and receive data as props.

Don't add `useEffect`-based data fetching. Add a Server Action and call it from the RSC.

### Cache invalidation rule (hard rule)

Every Server Action that mutates data must call `revalidatePath` for **every** page that reads that data — and, for cached lookup queries, `revalidateTag(tag.X(userId), 'default')`. Helpers `revalidateXSurfaces(userId?)` exist per actions file to centralize this.

### Auth + middleware

`middleware.ts` runs Clerk on every request. Public routes: `/`, `/login(.*)`, `/sign-in(.*)`, `/sign-up(.*)`. Auth bounce: signed-in users on `/` or `/login` get sent to `/upload`. Unauth on protected routes get sent to `/login`.

Server-side helpers: `requireUserId()` (throws "Unauthorized") and `getUserId()` (returns null) — both at `lib/auth.ts`.

### Three Drizzle clients myth, busted

The legacy CLAUDE.md mentions three Supabase clients. That's outdated — the Supabase migration was done. There is now **one** Drizzle client at `lib/db/index.ts`, used everywhere.

---

## 5. Pages

| Route | RSC fetches | Component | Purpose |
|---|---|---|---|
| `/` | none | `app/page.tsx` (landing) | Marketing landing for unauth users; auth users get redirected to `/upload`. |
| `/login` | none | `app/login/page.tsx` | Clerk-rendered sign-in. |
| `/sign-up/[[...sign-up]]` | none | Clerk-rendered. | |
| `/upload` (in `(dashboard)`) | `getStatements`, `getTags`, `getCategories`, `getHouseholdMembers`, settings | `components/upload-view.tsx` + `upload-dropzone.tsx` | Drop PDFs. Optional onboarding wizard if user is brand-new. Per-statement household-member attribution. |
| `/imports/[statementId]/review` | `getReviewData(statementId)`, `getTags`, `getCategories`, `getPendingStatements` | `components/review-view.tsx` | Confirm/reject staged rows, edit categories, toggle exclusions, edit statement metadata, see reconciliation banner. |
| `/transactions?month=&statement=` | `refreshTransactionData(month, statementId)`, `getAvailableMonthsList`, `getTags`, `getCategories`, `getStatementsForMonth` | `components/transactions-view.tsx` | View / tag / exclude / re-categorize confirmed rows. Optimistic tag updates. AI suggestions in TagInput. |
| `/insights?period=&value=&travel=` | `getInsights(period, filters)` + 5 lookup queries | `components/insights-view.tsx` | Per-Statement / Month / Year. Headline + by-category + top merchants + (planned) per-person card. Drill-into-category dialog. Optimistic filter toggles. |
| `/statements` | `getStatements` | List view | Inventory of every uploaded statement, links to review or detail. |
| `/statements/[id]` | `getStatementById`, `getTransactions`, `getTags`, `getCategories` | Statement detail with row table + delete. |
| `/settings/categories` | `getCategories` | Category CRUD UI. |
| `/summary` | redirect → `/insights` | legacy URL. |

---

## 6. Server Actions

All under `app/actions/`. Each file groups logic by domain.

| File | Notable exports |
|---|---|
| `transactions.ts` | `getTransactions`, `getMonthSummary`, `getInsights`, `getAvailableMonthsList` (cached), `getYearsWithDataList` (cached), `getStatementsForMonth` (cached), `setTransactionTravel`, `updateTransactionExclusion`. |
| `statements.ts` | `getReviewData`, `confirmStatementImport`, `getStatements` (cached), `getStatementById`, `getRecentStatements`, `getPendingStatements`, `deleteStatement`, `updateStatementMetadata`, `saveDuplicateDecision`. |
| `categories.ts` | `getCategories` (cached), `createCategory`, `renameCategory`, `updateCategory`, `deleteCategory`, `setTransactionCategory`, `confirmAiCategory`, `clearTransactionCategory`, `setImportCategory`, `confirmAiImportCategory`, `clearImportCategory`, `recategorizeUncategorized`, `restoreDefaultCategories`. |
| `tags.ts` | `getTags` (cached), `createTag`, `updateTag`, `deleteTag`, `setTagDescription`, `generateTagDescription`, `assignTagsToTransaction`. |
| `household-members.ts` | `getHouseholdMembers` (cached), `createHouseholdMember`, `ensureHouseholdMember`. |
| `composite.ts` | `refreshTransactionData(month, statementId)` — bundles a transactions read + month summary. |
| `suggestions.ts` | `suggestTagsForTransactionAction`, `backfillTransactionEmbeddings`. |
| `settings.ts` | `getSettings`, `updateSettings` (currency, country). |
| `onboarding.ts` | `completeOnboarding` — one-shot: seed categories for the user's country + create initial members. |

API route handlers (only used where Server Actions can't carry the payload):

- `app/api/statements/ingest` — `POST` PDF upload (multipart). 4 MB cap, 90 s `maxDuration`, rate-limited per Clerk user. Calls `extractTablesAndRejections` then `ingestStatement`.
- `app/api/statements/parse` — present, used for parser dev/diagnostics.

---

## 7. Data model (Neon Postgres)

Schema source: `db/init.sql`. Drizzle mirror: `db/schema.ts`.

| Table | Purpose | Key columns |
|---|---|---|
| `statements` | Uploaded files. One row per PDF. | `bank` (slug), `statement_type` enum, `period_start/end`, `currency`, `expected_total`, `expected_total_kind`, `previous_balance`, `status`, `source_file_sha256` (dedup). |
| `transaction_imports` | **Staging** rows — extracted but not yet promoted. Lives until user accepts/rejects on review. | Mirrors `transactions` plus `resolution` enum, `existing_transaction_id` (dup link), `is_travel`, `category_id`, `category_source`. |
| `transactions` | Confirmed rows. The source of truth for everything downstream. | `transaction_identifier` (deterministic hash, dedup index), `month_bucket`, `description_embedding` (pgvector 1536), `category_id`, `category_source`, `is_travel`, `is_excluded`, `exclusion_reason`. |
| `tags` | **Both** categories (`kind='category'`) and labels (`kind='label'`). Hierarchical via `parent_id`. | `name` (lowercase-enforced), `description`, `embedding` (pgvector 1536), `color`. |
| `transaction_tags` | Join: transaction ↔ label. Exactly one row per transaction has `is_primary=true`. | enforced by partial unique index `idx_transaction_tags_one_primary`. |
| `household_members` | Roster of people in the household. | `name` (case-insensitive unique per user), `color`. |
| `statement_members` | Junction: which members "own" a statement. | (statementId, memberId). |
| `user_settings` | Per-user prefs. | `currency`, `country`, `auto_tag_enabled`, `ai_monthly_budget_cents`, `ai_spent_this_month_cents`, `ai_budget_reset_at`. |

**Postgres functions (RPCs)** in `db/init.sql`:

- `knn_neighbour_tags(user_id, exclude_id, embedding, limit)` — KNN over the user's tagged transactions, returns each neighbour with its tag set. Used by `lib/suggest/suggest.ts`.
- `knn_nearest_tags(user_id, embedding, limit)` — zero-shot match against the user's tag-label embeddings.
- `knn_neighbour_categories(...)` and `knn_neighbour_categories_for_imports(...)` — same shape, scoped to category_id. Used by auto-apply.
- `knn_nearest_categories(...)` — zero-shot match against category embeddings.

**Multi-user isolation contract:** every `select`/`update`/`insert`/`delete` MUST include `where userId = $clerkId`. There is no RLS to catch a mistake. The `user_id` columns are `text` (not uuid) because Clerk IDs are strings.

---

## 8. PDF ingestion pipeline

The hardest part of the codebase. A TypeScript port of an older Python parser; keep the rejection-logging contract (`lastRejections`) when editing.

```
PDF → pdfjs-dist words → lines (y/x grouping) →
  StatementProfile (generic | altitude_credit_card | dbs_deposit_investment) →
  classify column bands (Withdrawal / Deposit / Balance) →
  parser → row[] + rejections[]
```

| Step | File |
|---|---|
| Upload + auth + multipart | `app/api/statements/ingest/route.ts` |
| Words / lines / sections | `lib/pdf/words.ts`, `lines.ts`, `sections.ts` |
| Header → bank, period, type, last4 | `lib/pdf/metadata.ts` |
| Profile selection (filename + heading heuristics) | `lib/pdf/profiles.ts` |
| Layout-aware extraction | `lib/pdf/extract-tables.ts`, `lib/pdf/parser.ts` |
| PII strip | `lib/pdf/types.ts` (`sanitizeDescription`) |
| Deterministic per-tx hash | `lib/transaction-identifier.ts` |
| File hash dedup + staging insert | `lib/db/ingest.ts` |
| AI auto-apply (inline) | `lib/suggest/auto-apply.ts` (`autoApplyCategoriesBatch`, `llmFallbackForUncategorizedImports`) |

**Rejection contract:** rows the parser refuses are first-class output, surfaced via `lastRejections`. Don't drop them silently.

---

## 9. AI features

All under `lib/suggest/`.

### What runs and when

| Surface | Path | Cost gate |
|---|---|---|
| **Auto-apply at ingest** (free signals + LLM fallback for cold rows) | `autoApplyCategoriesBatch` + `llmFallbackForUncategorizedImports`, both called inline from `lib/db/ingest.ts:280`. | Embed cost on every ingest. LLM only when KNN+tag-embed fail. Subject to `user_settings.ai_monthly_budget_cents`. |
| **Recategorize Uncategorized** button | `app/actions/categories.ts` `recategorizeUncategorized` → `recategorizeUncategorizedTransactions`. | LLM per uncategorized row, batched (50). Same budget gate. |
| **On-demand tag suggestions** in /transactions TagInput | `app/actions/suggestions.ts` `suggestTagsForTransactionAction` → `lib/suggest/suggest.ts`. | One LLM call per uncovered transaction, only if KNN+tag-embed don't cover it. |

### The three-signal stack

1. **KNN** over the user's tagged transactions (`knn_neighbour_tags` / `knn_neighbour_categories_for_imports`). Vote-based. Strongest signal once the user has labelled history.
2. **Tag-embed similarity** (`knn_nearest_tags` / `knn_nearest_categories`). Compares the transaction embedding against every category/label's `name + description` embedding. Cold-start friendly.
3. **LLM fallback** (`gpt-5.4-mini`, batched 50 rows per call, function-call output). Only fires when the cheaper signals don't cross threshold.

### Tag/category embeddings

`tags.embedding` is set automatically:
- On create/rename: `lib/suggest/embed.ts` `embedTags(...)` runs in an `after()` callback.
- Tag descriptions are LLM-seeded on first creation (`lib/suggest/seed-tag-description.ts`) — concise comma-separated cues (country codes, merchant names, currencies).
- Editable via `TagEditDialog`.

### Forbidden auto-categories

`AI_FORBIDDEN_CATEGORY_NAMES` in `lib/suggest/auto-apply.ts`: `other`, `travel`, `flights`, `hotels-stays`, `tours-activities`, `rental-car`. Travel is replaced by the `is_travel` flag set on the row by lexical foreign-currency detection (`detectIsTravel`). Users can still pick these manually.

### Travel detection

Purely lexical, free, runs before any AI. Tokenizes the description, checks tokens against ISO 4217 codes (excluding the user's home currency + a high-FP allowlist). `lib/suggest/auto-apply.ts:detectIsTravel`.

### Budgets

`lib/suggest/budget.ts` checks `user_settings.ai_monthly_budget_cents` before each LLM call; resets monthly. `incrementSpend(userId, cents)` atomically increases spend after each call.

---

## 10. Caching & perf (recently shipped)

Every page is `force-dynamic` so filter changes re-render server-side. The lookup queries (months/years/statements/members/tags/categories) used to refetch on every filter click. Now:

- **`unstable_cache`** wraps each lookup, keyed by `userId` (and any param like `month`).
- **Cache tags** in `lib/cache/tags.ts`: `tx:`, `statements:`, `members:`, `labels:`, `categories:`. Read paths register the tag; write paths call `revalidateTag(tag, 'default')`.
- **Loading skeletons**: `app/insights/loading.tsx`, `app/transactions/loading.tsx` — instant feedback while the server re-renders.
- **Optimistic toggles** on `/insights`: clicked filter button highlights immediately + shows a `Loader2` spinner. Other filters disable during transition. The data area dims via `opacity-50 pointer-events-none`.

Result: cold filter click ≈ pre-existing latency; subsequent clicks within the hour skip 6 of 7 queries (~300-500 ms saved).

`getInsights` itself is **not** cached — it has too much filter-key surface. Could be added later with the same `tx:` tag.

---

## 11. Conventions / non-negotiables

These are hard rules — see `.agent/rules/stack-and-compliance.md`.

- **Stack lock.** Next.js App Router (RSC default), Shadcn UI, Tailwind utilities (no arbitrary values like `p-[16px]`), `lucide-react` icons, Drizzle, Clerk.
- **App-level isolation.** Every query references `userId`. Forgetting this is a security bug.
- **Cache invalidation** is the contract: every mutation revalidates the surfaces that read it (paths) and the cache tags (lookup queries).
- **Financial-advice compliance.** UI copy must be **descriptive, not prescriptive**. ✅ "Coffee spending up 20%." ❌ "You spend too much on coffee." Applies to insights and any future AI output.
- **Privacy.** Never log PII (descriptions, statement contents, emails). Parser logs by pattern, not raw rows.
- **Shadcn dialog props** use `<Dialog open onOpenChange>` — not `onClose` / `isOpen`.
- **No unrequested abstractions.** Don't add helpers, fallbacks, or "future-proofing" beyond the task. Three similar lines beats a premature factory.
- **Don't write code comments** unless the WHY is non-obvious. Identifiers carry the WHAT.

---

## 12. Status

### Shipped
- KISS spec steps 1–5 (upload → redact → extract → review → AI categorize) end-to-end.
- Statement metadata edit dialog (escape hatch for parser misreads).
- Reconciliation banner (extracted total vs printed total).
- Per-statement household-member attribution (junction table + UI on /upload).
- Hierarchical categories (singular, country-seeded, AI-applied at ingest, `is_travel` flag).
- Free-form labels schema + tag suggestions in /transactions TagInput.
- Auto transfer **detection in the lexical sense** (foreign currency → travel flag); cross-statement transfer pairing **not yet**.
- Insights v0: Statement / Month / Year toggle, by-category, top merchants, drill-into-category, travel toggle.
- Drizzle/Clerk/Neon migration completed 2026-04-27. Live at together.gastos.pro.
- Caching layer + loading skeletons + optimistic toggles (2026-04-28).

### In flight / pending
- KISS Slice 5 — **cross-statement transfer detection**: mirror-match heuristics + `suspected_transfer_partner_id` column + ingest wire-in + ↔ icon on review row.
- KISS Slice 6 — **per-person insights dimension**: schema is ready (`statement_members`); UI extension still owed (chips: All / {member} / Joint; per-member card; member dimension on `getInsights`).
- Rename `middleware.ts` → `proxy.ts` (Next 16 deprecation warning).
- Drop stale `NEXT_PUBLIC_SUPABASE_*` env vars from Vercel.

### Known divergence
- Local `main` is 12 commits ahead of `origin/main`. Working tree has ~60 uncommitted files (the Drizzle/Clerk migration). Production deploys come from `vercel` CLI off the laptop, not GitHub auto-deploy.

---

## 13. Improvements roadmap

**Highest-leverage next:**
1. **Transfer detection** (1 session). The carrot for "upload everything in one go." Pre-flag suspected transfers / CC payments so the user one-click-confirms instead of hunt-and-exclude. Plan in `~/.claude/plans/good-morning-claude-help-velvet-firefly.md`.
2. **Per-person insights** (½ session). Pure UI; data is wired.
3. **Reconcile git** (1 hr). Either bundle the migration into one or two commits and push to `origin/main`, or keep local-only as the deploy strategy and document it. The drift gets harder to recover from each session.

**Quality-of-life:**
- Apply optimistic-toggle pattern to `/transactions` filters too.
- Cache `getInsights` itself (same `tx:` tag, with period+filters in the key).
- Add a Skeleton primitive in `components/ui/skeleton.tsx` and use it in the loading routes (current code uses raw `animate-pulse` divs).
- Move the inline AI work in `ingest.ts` to `after()` if uploads start hitting the 90 s `maxDuration`. The KNN/tag-embed pass needs to stay inline (review screen depends on it); LLM fallback can be deferred.

**Product-level (deferred KIVs):**
- **Personal merchant dictionary** (`merchant_hints` table for user overrides). Country seeds + tag embeddings cover the locale-aware embedding part; per-merchant overrides still owed.
- **Editable metadata v2** — picker chips with parser-surfaced candidates instead of free-form inputs.
- **True multi-user household** (RLS-style isolation across users in one household). Today's `household_members` is single-user attribution; full sharing is a `household_id` + `household_user_members` extension.
- **Free-form labels UI** on confirmed transactions. Schema supports it; UI surface not wired beyond the ingest review screen.
- **Source badges** on tag suggestions (`knn | tag-embed | llm | mixed`). Available in payload, not rendered.

**Tech debt:**
- `lib/suggest/auto-apply.ts` still has 3 pre-existing lint errors (`@ts-ignore` and two `any`s) carried over from the Supabase port. Not blocking; cleanup when next touching the file.
- `next/cache` `unstable_cache` should migrate to Next 16's `'use cache'` directive once `experimental.cacheComponents` is opted into.

---

## 14. Where to start as a new contributor (or AI)

1. Read `docs/stupid-simple-spec.md` — 6 steps. Anything off-spec needs justification.
2. Read `CLAUDE.md` — concrete rules + current commands.
3. Skim `db/init.sql` — schema is the source of truth.
4. Read one feature end-to-end: e.g. tag suggestions
   - `lib/suggest/suggest.ts` (orchestrator)
   - `lib/suggest/embed.ts` (vectors)
   - `app/actions/suggestions.ts` (server boundary)
   - `components/ui/tag-input.tsx` (client surface)
5. Real PDFs live in `tests/private/` (gitignored). For parser work, run against those — design empirically, not from spec text. (See feedback memo `feedback_empirical_first.md`.)

When in doubt, the spec wins. KISS wins.
