# Review Refinements & Exclusion Persistence (Spec 6)

**Reference Spec:** [Transaction Storage (v0.1)](docs/specs/2-storing-transactions.md)

## Changelog
- **2025-01-20**: Created to address user feedback on Review/Transactions interfaces.

## 1. Re-enable Tagging
**Context:** The "Tags" column in `TransactionTable` was commented out, removing it from both Review and Transactions views.
**Change:**
- Uncomment "Tags" column in `TransactionTable`.
- Ensure it respects the `enableTagging` prop (already present).
- **Behavior:**
  - `TransactionsPage` (default `enableTagging=true`): Shows Tags column.
  - `ReviewPage` (passes `enableTagging=false`): Hides Tags column.

## 2. Persist Exclusion Logic
**Context:** When a user excludes a transaction during the Review phase, the decision is lost upon import because `transaction_imports` lacks exclusion columns, and the action `updateTransactionExclusion` only targets the `transactions` table.
**Change:**
- **Schema:** Add `is_excluded` (boolean) and `exclusion_reason` (text) to `transaction_imports` table.
- **Action:** Update `updateTransactionExclusion` (or create `updateTransactionOrImportExclusion`) to:
  - Check if target ID exists in `transactions`. If yes, update it.
  - If no, check `transaction_imports`. If yes, update it.
- **Confirmation:** Update `confirmStatementImport` to copy `is_excluded` and `exclusion_reason` from `transaction_imports` to the new `transactions` record.

## 3. Simplify Duplicate Handling
**Context:** "Potential Duplicates" section complicates the review. The user trusts the system's duplicate detection (based on unique ID).
**Change:**
- **UI:** Remove "Potential Duplicates" section from `ReviewPage`.
- **Logic:**
  - `getReviewData`: Stop fetching/returning duplicates to the frontend (or return empty list).
  - `confirmStatementImport`: Existing logic defaults to `rejected` (keep existing) for pending imports that don't get an explicit "accept" action. This ensures duplicates are silently skipped and marked as resolved (rejected).
  - **Outcome:** Users only see and confirm "New" transactions. Duplicates are automatically discarded from the import batch.

## Technical Plan

### Database (`supbase/migrations`)
- [ ] Create migration to add `is_excluded`, `exclusion_reason` to `transaction_imports`.
- [ ] Inspect existing permissions/RLS to ensure `transaction_imports` update is allowed.

### Components (`components/transaction-table.tsx`)
- [ ] Uncomment Tags column logic.
- [ ] Ensure `enableTagging` check wraps the column header and cell.

### Backend Actions
- [ ] `app/actions/transactions.ts`: Update `updateTransactionExclusion` to handle imports (check both tables or logic).
- [ ] `app/actions/statements.ts`:
  - Update `mapImportToTransaction` to map exclusion fields.
  - Update `confirmStatementImport` to include exclusion fields in `INSERT`.
  - Update `getReviewData` to filter out duplicates or return empty duplicates list.

### Frontend (`app/imports/[statementId]/review/page.tsx`)
- [ ] Remove "Section B: Potential Duplicates".
- [ ] Remove `DuplicateComparison` component usage.
