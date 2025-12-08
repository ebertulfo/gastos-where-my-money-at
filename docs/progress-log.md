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
