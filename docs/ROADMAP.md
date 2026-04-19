# Gastos Roadmap

_Last updated: 2026-04-19_

## Status At-A-Glance

- **M1 — Statement Ingestion MVP**: **shipped**. Upload → parse → review → commit works end-to-end. Auth, landing page, and dedicated statement management are in place.
- **M1.5 refinements**: tagging (replaces "categories" — see Spec 3), exclusion column, onboarding wizard, review screen overhaul (Spec 6 + revision), transactions page migrated to RSC + Server Actions + optimistic UI, RSC migration of /upload + /imports/[id]/review, cache-invalidation rule documented.
- **M2 — Classification & Enrichment**: **partial**. On-demand hybrid tag suggestions shipped (`lib/suggest/`): pgvector KNN over the user's tagged history, with gpt-5.4-nano LLM fallback for cold-start. Surfaces in TagInput on /transactions. No merchant normalization yet.
- **M3 — Insights Dashboard**: **v0 shipped**. `/insights` page with [Statement | Month | Year] toggle: headline + tag breakdown + top-10 merchants. No commentary / trend narrative / charts yet.
- **M4 — Hybrid Inputs**: not started.

## 0. Product Direction

Gastos is no longer "an expense chatbot."

**Core wedge:**  
> Upload all your household bank/credit card statements → get a clean, deduped, categorized view of where your money went.

Daily logging (chat, receipts, voice) becomes an **optional add-on later**, not a blocker for V1.

Primary initial users:
- You and your wife, across multiple bank accounts and multiple statements.
- Goal: unfuck your finances by seeing clearly where the household money actually goes each month.

---

## 1. Existing Specs & Building Blocks

These are the current spec documents this roadmap builds on:

- **PDF Parsing Pipeline — Spec (v3)**  
  `docs/specs/0-transactions-extractor.md`

- **Transaction Identifier Specification**  
  `docs/specs/1-transaction-identifier.md`

- **Transaction Storage & Deduplication — Spec (v0.3)**  
  `docs/specs/2-storing-transactions.md`

- **Categorization, Exclusion & Onboarding — Spec (v0.2)**  
  `docs/specs/3-categorization-and-onboarding.md`

- **Statement Management — Spec (v0.1)**  
  `docs/specs/4-statement-management.md`

- **Authentication & Onboarding — Spec (v0.1)**  
  `docs/specs/5-auth-and-landing.md`

- **Review Refinements — Spec (v1.0)**  
  `docs/specs/6-review-refinements.md`

- **Review Screen Overhaul — Delta Spec**  
  `docs/specs/6-revision-review-screen.md`

These define:

- How PDFs are parsed safely in-memory and normalized into `[Date, Description, Amount, Balance, Identifier]` rows (Spec 0 v3).
- How unique transaction identifiers are generated for deduplication (Spec 1).
- How statements and transactions are stored, staged, and confirmed by the user (Spec 2 v0.3).
- How tagging, exclusion, and onboarding shipped (Spec 3 v0.2 — note that original "categories" was replaced by tags).
- How statement management, auth/landing, and the review-screen overhaul layered on top (Specs 4–6).

The roadmap below assumes these are the foundation.

---

## 2. Milestone Overview

**M1 — Statement Ingestion MVP (YOU + WIFE USABLE)**  
Upload statements → parse → dedupe → confirm → store.  
_No categories yet. No analytics. Just clean, reliable transaction history._

**M2 — Classification & Enrichment**  
Add AI categorization and merchant normalization on top of stored transactions.

**M3 — Spending Insights Dashboard**  
Expose "Where did our money go?" via simple, clear summaries per month and household.

**M4 — Optional Hybrid Inputs (Chat/Photo/Voice)**  
Add extra ways to log non-statement expenses (cash, receipts) on top of the statement engine.

---

## 3. M1 — Statement Ingestion MVP (Shipped)

> **Status (2026-04-19):** Shipped. The details below describe the M1 goal as originally conceived; see the linked specs for current behaviour. Notable post-spec changes: duplicate handling moved from "user-resolved per row" to "silently skipped via ON CONFLICT DO NOTHING" (Spec 6), and the parser was rewritten onto `pdfjs-dist`/`unpdf` word coordinates (Spec 0 v3).

### Goal

Enable a user to:

1. Upload one or more statements.
2. Parse and sanitize transactions.
3. Review new vs duplicate transactions.
4. Confirm what to keep.
5. Persist transactions in a deduped, queryable store.

This milestone should be **usable by you and your wife** end-to-end.

### Scope

**Backend / Pipeline**

- Use `/api/statements/parse` as per PDF Parsing spec (v2). :contentReference[oaicite:3]{index=3}  
- Create `statements`, `transactions`, and `transaction_imports` tables as per Storage & Dedup spec. :contentReference[oaicite:4]{index=4}  
- Implement ingestion flow:
  - Create `statement` record with metadata + file hash.
  - For each row:
    - Generate `transaction_identifier` using the identifier spec. :contentReference[oaicite:5]{index=5}  
    - Stage rows into `transaction_imports` as `pending`.
    - Check for existing transactions with same identifier (`user_id`, `transaction_identifier`).
    - Mark potential duplicates by setting `existing_transaction_id`.
  - No silent overwrites. Existing transactions always win by default.

**UI / UX**

- **Upload Screen**
  - Drag & drop + file picker for PDF (later CSV).
  - Simple status: "Parsing…", "Parsed", "Error".
  - Show a summary after parse: file name, period, number of transactions found.

- **Review Screen**
  - Section A: Statement overview (period, currency, transaction count).
  - Section B: **New Transactions** (no duplicates)
    - Grouped by `month_bucket` (`YYYY-MM`).
    - Single **"Accept all new transactions"** action.
  - Section C: **Potential Duplicates**
    - Show existing vs new side by side.
    - Default action: "Keep existing (skip new)".
    - Optional "Add as new anyway" toggle for edge cases.
  - **Finalize button**: commits accepted rows into `transactions` and marks statement as `ingested`.

**Data Model**

- Enforce unique constraint on (`user_id`, `transaction_identifier`) in `transactions`.
- Persist `month_bucket` on each transaction for later grouping.
- Keep `transaction_imports` rows as an audit trail (who accepted/rejected what and when).

### Out of Scope (for M1)

- No AI categorization.
- No budgets.
- No charts or graphs.
- No per-category summaries.
- No multi-currency support.
- No fancy account modeling (just attach everything to one household/user for now).

### Dependencies

- Parsing spec implemented and stable.
- Sanitization applied before storage (as defined in parsing spec). :contentReference[oaicite:6]{index=6}  

### Success Criteria

- You and your wife can:
  - Upload all your known PDFs.
  - Confirm imports through the review UI.
  - See a complete, deduped list of all historical transactions in a simple table.
- Re-uploading the same file does NOT create duplicates.
- Overlapping periods from different statements do NOT create duplicates (identifier works).

---

## 4. M2 — Classification & Enrichment (Partial stand-in)

> **Status (2026-04-19):** AI classification not started. User-defined **tags** (`tags` + `transaction_tags` tables, many-to-many) replaced the originally-planned single `categories` column. See Spec 3 for the rationale and current tagging surface.

### Goal

Turn raw transactions into **enriched financial data**:

- Categories (Food, Transport, Groceries, etc.) — currently user-tagged, not AI-classified.
- Merchant normalization (grouping variations of the same merchant).
- Metadata for later insights (recurring payments, subscriptions, etc.).

### Scope

**Backend**

- Add category-related fields to `transactions`:
  - `category` (string)
  - `subcategory` (optional)
  - `merchant_canonical` (e.g. "FairPrice" instead of 5 variations)
- Implement a classification job:
  - Take uncategorized transactions in batches.
  - Call an LLM with sanitized descriptions, amounts, and maybe merchant patterns.
  - Store results idempotently (re-runs should be safe).
- Start building a merchant alias table (e.g. `merchant_aliases`):
  - `alias` → `canonical_name`.

**UI**

- Minimal category exposure:
  - Transactions table shows category and canonical merchant.
  - Simple filters by category and month.

### Out of Scope (for M2)

- No budgets.
- No alerts.
- No optimization suggestions.

### Success Criteria

- New transactions automatically get categories and normalized merchants.
- You can filter by category and see if the categories "feel right" for your real data.

---

## 5. M3 — Spending Insights Dashboard

### Goal

Expose the **core value**:  
> “Where did our household money go this month (and how is that changing over time)?”

### Scope

**Backend**

- Queries for:
  - Total spend per month (per household).
  - Breakdown by category.
  - Top merchants per category.
  - Month-over-month change (e.g. Jan vs Feb).
- Keep it text-based if you want to avoid charts initially.

**UI**

- **Month Selector**
  - Dropdown: "This month", "Last month", specific YYYY-MM.

- **Key Sections**
  - **Headline summary**, e.g.  
    > "In November 2025, your household spent SGD 4,832.  
    > 38% on Food & Groceries, 32% on Bills, 12% on Transport."
  - **Category breakdown**
    - List of categories with amounts and percentages.
  - **Top merchants**
    - Show top 5–10 merchants by spend for the selected month.
  - **Trend insight (optional)**
    - Text diff: "You spent 18% more on Eating Out vs last month."

### Out of Scope (for M3)

- Fancy visualizations.
- Budgets/targets.
- Alerts or recommendations.

### Success Criteria

- For any month in your data, you and your wife can see:
  - Exactly how much you spent.
  - Where it went (by category and merchant).
  - High-level trend vs previous month.

---

## 6. M4 — Hybrid Inputs (Optional, Later)

### Goal

Allow logging of **non-statement** expenses (cash, travel cash, receipts) using simpler modalities, backed by the existing transaction model.

### Scope

- Inputs:
  - Manual UI form.
  - Chat-style interface.
  - Photo receipts (vision-based extraction).
  - Voice-to-text (optional).
- All of these write to the **same `transactions` table**, just with different `source_type` metadata:
  - `statement` vs `manual` vs `receipt` vs `chat`.

### Success Criteria

- You can track things that will never show up in statements:
  - Cash spending (e.g. hawker center).
  - Shared expenses.
  - Travel cash that gets spent locally.

---

## 7. Implementation Priority & Reality Check

When in doubt, follow this order:

1. **M1: Ingestion MVP**  
   - Parse → stage → review → store.
   - Make this flawless for your own statements first.

2. **M2: Classification**  
   - Automatically categorize and normalize.

3. **M3: Insights Dashboard**  
   - Focus only on:
     - Total spend
     - Category breakdown
     - Top merchants

4. **M4: Hybrid Inputs**  
   - Only when the statement engine + dashboard feel solid and useful.

This roadmap keeps you laser-focused on the wedge that matters most **right now**:  
Get all of your and your wife’s statements in, deduped, and visible in one place, then layer intelligence on top.
