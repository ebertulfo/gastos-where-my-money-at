# Categorization, Exclusion & Onboarding — Spec (v0.3)

## Changelog

| Date | Author | Description |
| :--- | :--- | :--- |
| 2026-04-19 | ebertulfo | v0.3: Tag names are lowercase-only; tags gain `description` + `embedding` columns so zero-shot suggestions work from day one. New per-tag edit dialog with `Refresh AI`. Suggestion pipeline now three-signal (KNN, tag-embed, LLM) with union-merge in the LLM branch. |
| 2026-04-19 | ebertulfo | v0.2: Reconcile with shipped code. Categories were never built — tagging replaced them. Exclusion shipped as described. Onboarding shipped via `user_settings` + country→currency selection. |
| 2025-12-08 | ebertulfo | v0.1: Initial draft covering Categories, Payment flag, and Onboarding flow |

## Status Summary

| Original scope | Actual status |
| :--- | :--- |
| `categories` table + single-category assignment | **Not built.** Superseded by **tags** (many-to-many). |
| `is_payment` flag + "Total Spend" exclusion | **Shipped**, generalized to `is_excluded` + `exclusion_reason`. |
| Onboarding wizard (first-run) | **Shipped**, but seeds currency (not categories) via country selection. |

This spec is retained as a record of the original intent. Read alongside the "What shipped" sections below for current behaviour.

## 1. Tagging (shipped, replaces "Categorization")

### Why tags instead of categories

A single `category_id` per transaction forced a taxonomy decision we weren't ready to make for household spending that often spans multiple meaningful labels (e.g. a "Grab ride to the airport" is both `Transport` and `Travel`). Many-to-many tags let users layer labels without pre-committing to a hierarchy.

### Schema

Initial migration: `20251208000000_tags_and_payments.sql`. Extended by `20260419000005_lowercase_tags.sql` and `20260419000006_tag_embeddings.sql`.

`tags`:
- `id` uuid pk
- `user_id` uuid fk → `auth.users`
- `name` text — unique per user, **lowercase-only** (enforced by `tags_name_lowercase_chk CHECK (name = lower(name))`)
- `parent_id` uuid, nullable, self-ref — reserved for future hierarchy, not surfaced in UI today
- `color` text, nullable
- `description` text, nullable — embedding-friendly semantic cues (country codes, currencies, known merchants, transaction verbs). Auto-seeded by the LLM on tag creation; user-editable via the tag-edit dialog.
- `embedding` vector(1536), nullable — `text-embedding-3-small` over `composeTagEmbedText(name, description)`. HNSW-indexed.
- `created_at` timestamptz

`transaction_tags` (junction):
- `(transaction_id, tag_id)` composite pk, both cascade-deleted
- RLS gated via subquery on `transactions.user_id`
- `is_primary` boolean, enforced one-per-transaction by `idx_transaction_tags_one_primary`

### Suggestion pipeline (`lib/suggest/`)

Triggered on-demand when the user opens `TagInput` on a transaction. Three signals, picked in order of strength:
1. **KNN over transaction embeddings** (`knn_neighbour_tags` RPC) — votes from the user's prior tagged transactions. Dominates when ≥3 neighbours have cosine similarity ≥ 0.75.
2. **Tag embeddings** (`knn_nearest_tags` RPC) — cosine similarity between the transaction embedding and each tag's `(name, description)` embedding. Used as the primary signal when ≥2 tags score ≥ 0.35 on a cold start; otherwise blended additively into KNN votes.
3. **LLM fallback** (`gpt-5.4-nano` via tool-use) — picks from the user's vocabulary using weak KNN hits as few-shot. Prompt now instructs *"always return at least 1 tag"* (best-effort); tag-embed candidates are unioned onto the result so geographically-obvious tags (e.g. `japan` for a JR JP transaction) aren't dropped when the LLM picks functional categories (`hotels`, `flights`).

`normalizeForEmbedding` expands ISO country codes (`JP` → `JP JAPAN`, 20-code whitelist, false-positive-prone codes skipped) and strips `XXXX-XXXX-…` masked card patterns before embedding. Tag and transaction embeddings live in the same normalized space.

### UI

- **Transactions table** (`/transactions`): inline tag assignment via `components/ui/tag-input.tsx`. Creating a new tag from the input auto-inserts into `tags`, then seeds description + embedding in the background via Next's `after(...)`.
- **Tag edit dialog** (`components/ui/tag-edit-dialog.tsx`): pencil icon on each tag row in `TagInput` opens a dialog with a description textarea + `Refresh AI` button. Saves via `setTagDescription` / `generateTagDescription` server actions; both trigger re-embedding.
- **No standalone tag management page** yet — inline editing covers rename/delete/description. Bulk merge and `parent_id` hierarchy still deferred.
- **Review screen** does not allow tagging (`enableTagging={false}`). Tags are applied after ingestion, on the transactions page.

### Open follow-ups

- Standalone `/tags` page for bulk operations (multi-select → merge, rename across hierarchy).
- Tag hierarchy surfaced in UI (the `parent_id` column is already there).
- Bulk-tag assignment (select multiple rows → apply tag).
- Source badges on suggestion pills (the `source: 'knn' | 'tag-embed' | 'llm' | 'mixed'` field is already populated server-side).

## 2. Transaction Exclusion (shipped as specified, generalized)

### Schema

- `transactions.is_excluded` (boolean, default false) — migration `20251208000006` renamed `is_payment` → `is_excluded`.
- `transactions.exclusion_reason` (text, nullable) — added in the same migration.
- `transaction_imports.is_excluded` (boolean, default false) — added in migration `20260120000001` so the review-time decision survives the commit hop.
- `transaction_imports.exclusion_reason` (text, nullable) — same migration.

### Behaviour

- Eye/Eye-Off toggle on each transaction row in both the transactions table and the review screen.
- Toggling off opens a popover for an optional reason string (`"Duplicate"`, `"Internal transfer"`, etc.).
- `updateTransactionExclusion` server action writes to whichever of `transactions` / `transaction_imports` owns the id — review-time exclusions are written to staging and copied into `transactions` at commit.
- `getMonthSummary` / "Total Spend" filters excluded rows out of the sum.
- Excluded rows render dimmed + strikethrough.

## 3. Onboarding (shipped, currency-first)

### Trigger

`app/(dashboard)/upload/page.tsx` checks for the presence of a `user_settings` row for the current user on first render. Missing row → render `components/onboarding-wizard.tsx` over the page.

### Flow

1. **Welcome** — intro copy.
2. **Region** — pick a country from a fixed list (SG / US / GB / EU / AU / MY / ID / PH / TH / JP). Country maps to a default currency, which is written to `user_settings.currency`. There is no "pick your own categories" step.
3. **Tags (optional)** — user can seed initial tags. This step is skippable.
4. **Success** — wizard closes; the user is on the upload page.

### What did not ship

- No "Here are some defaults we recommend: [Food, Transport, …]" categories step. The categories idea was replaced by tags, and there is no curated tag starter set today.
- No "Do you already have categories?" branching.

## 4. Related code

| File | Role |
| :--- | :--- |
| `app/actions/tags.ts` | CRUD for tags + junction table |
| `app/actions/onboarding.ts` | `completeOnboarding` — writes `user_settings` |
| `app/actions/settings.ts` | Read/update `user_settings` |
| `app/actions/transactions.ts` | `updateTransactionExclusion`, `setTransactionTags`, etc. |
| `components/onboarding-wizard.tsx` | Multi-step dialog |
| `components/transaction-table.tsx` | Tag + exclusion controls |
| `components/ui/tag-input.tsx` | Shadcn-style multi-select with inline tag creation |

## 5. Out of Scope / Future

- AI-assisted categorization (M2 in `docs/ROADMAP.md`). Likely to generate **tag suggestions** rather than writing a single `category_id`.
- Budget/target tracking (M3).
- Rule-based auto-tagging (e.g. "every `GRAB *` transaction gets `Transport`").
