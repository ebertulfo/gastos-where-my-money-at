# Review Screen Overhaul (Delta Spec)

**Reference Spec:** [Review Refinements (v1.0)](docs/specs/6-review-refinements.md)

## 1. Interaction Model: Selection vs Exclusion
**Current Behavior:** 
- Users click a "Minus" icon to *exclude* a transaction.
- Excluded items are marked with a strikethrough/dimmed state but the primary action is "Exclusion".

**New Behavior:**
- **CheckBox Selection:** Every row has a checkbox on the left.
- **Default State:** All items are `checked` (Selected) by default.
- **Uncheck:** Unchecking a row marks it for exclusion.
    - **Visual:** Row fades to 50% opacity, text gets strikethrough.
- **Bulk Actions:** "Select All" / "Deselect All" in the header.

## 2. Layout: Date-Based Grouping
**Current Behavior:**
- Flat list of transactions sorted by ID or Import Order.
- Hard to scan 100+ items.

**New Behavior:**
- **Grouping:** Transactions are grouped by **Date**.
- **Headers:** Monthly/Daily headers (e.g. "Nov 29, 2024") which stick to the top as you scroll.
- **Sorting:** Strictly chronological (descending).

## 3. Persistent Actions (Sticky Footer)
**Current Behavior:**
- "Finish Import" and "Delete Import" buttons are at the very bottom of the lists.
- Users must scroll to the end to act.

**New Behavior:**
- **Sticky Footer:** A fixed bottom bar that is always visible.
- **Contents:**
    - **Summary Text:** "Importing X transactions (Y excluded)"
    - **Primary Action:** [ Confirm Import ]
    - **Secondary Action:** [ Delete Import ] (With confirmation dialog)

## Technical Plan

### Components
#### `components/transaction-table.tsx`
- Refactor to support `grouped` mode or create a wrapper `GroupedTransactionList`.
- Add `selectionMode="checkbox"` prop.
- **Sticky Headers:** Implement date headers that stick using `sticky top-0`.
- **Selection Logic:** Replace `isExcluded` local state with a controlled `onSelectionChange` prop (or keep using `isExcluded` but visually mapped to a checkbox).

#### `app/imports/[statementId]/review/page.tsx`
- **State Management:**
    - Lift selection state up (or use a Map of `excludedIds`).
    - Initialize with empty `excludedIds` (meaning all selected).
- **Sticky Footer:** Implement a fixed element at `bottom-0`.

### Data Flow
- `useStatementReview` hook:
    - Add `toggleExclusion(id)`
    - Add `toggleAll(bool)`
    - Ensure `confirm()` respects the exclusion set.

### Compliance & Risks
- **Data Integrity:** "Unchecked" items are `rejected` in the backend. Ensure this logic holds.
- **UX:** Sticky headers must not overlap with the main Nav bar (z-index check).
