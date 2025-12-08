# Statement Management — Spec (v0.1)

## Changelog

| Date | Author | Description |
| :--- | :--- | :--- |
| 2025-12-08 | ebertulfo | Initial draft for Statement List and Detail views |

## Objective

Provide a dedicated interface for users to manage their uploaded statements. This includes a global list of all uploads and a detailed view for each statement to audit its specific transactions and perform deletion if necessary.

## Scope

- **Statement List Page (`/statements`)**: A table/list view of all uploaded statements.
- **Statement Detail Page (`/statements/[id]`)**: A view showing metadata and transactions specific to one statement.
- **Navigation**: Update main nav to include "Statements".

## 1. Statement List Page (`/statements`)

### Requirement
- Users need a central place to see what they have uploaded.
- Must show status (Ingested, Failed, Processing).
- Quick actions: View, Delete.

### UI Design
- **Header**: Title "Statements" + "Upload New" button (redirects to home/upload).
- **Table Columns**:
    - **Date Uploaded**
    - **Period** (e.g., "Nov 1 - Nov 30, 2025")
    - **Source** (Bank Name / Account)
    - **Filename**
    - **Status** (Badge: Success, Failed)
    - **Transactions** (Count)
    - **Actions** (Dropdown: View, Delete)

### Logic
- Fetch all statements from `statements` table, ordered by `period_start` desc.

## 2. Statement Detail Page (`/statements/[id]`)

### Requirement
- Users need to audit a specific upload, especially if they suspect issues (e.g., "Did I upload the right DBS PDF?").
- Unlike the main /transactions feed, this view is *scoped* to the single file.

### UI Design
- **Header**: Back button, Statement info (Bank, Period), and "Delete Statement" button (destructive).
- **Stats Cards**:
    - Total Amount
    - Transaction Count
- **Transaction Table**:
    - Same robust table as the main feed, but filtered strictly to `statement_id`.
    - Columns: Date, Description, Amount, Tags.
    - Exclude "Source" column (redundant here).

### Delete Interaction
- Clicking "Delete" on this page should:
    1. Confirm with user ("This will remove X transactions...").
    2. Call server action to delete statement (cascading to transactions).
    3. Redirect to Statement List.

## 3. Workflows

### Auditing an Upload
1. User goes to `/statements`.
2. Sees "DBS Nov 2025".
3. Clicks row -> navigates to `/statements/[id]`.
4. Reviews transactions.
5. Notices it's a duplicate or wrong file.
6. Clicks "Delete".

### Navigation
- Sidebar/Navbar: Add "Statements" link between "Dashboard" (Summary) and "Transactions".
