Nice. Let’s make this concrete and drawable.

I’ll lay out screen-by-screen wireframes you can translate straight into shadcn/Next.js. Think of this as “Figma in Markdown”.

We’ll cover:

Upload / Home

Parsing / Progress

Review Import (New vs Duplicates)

Transactions List (after import)

(Light) Month Summary stub

1. Screen: Upload / Home

Purpose:
Get the user to upload statements as fast and confidently as possible.

Layout (high-level)
---------------------------------------------------------
[Logo]  Gastos                         [Avatar/Settings]
---------------------------------------------------------

  [ Hero: "Unfuck your finances." ]
  [ Sub: "Upload your bank statements and see where 
          your household money really goes." ]

  [ Card: Upload Statements ]
  ---------------------------------------------------
  |  [📄] Drag & drop PDF statements here           |
  |      or                                        |
  |      [Choose files]                            |
  |                                               |
  |  Supported: Bank & credit card statements      |
  |  We don't store your PDFs, only the extracted  |
  |  transactions.                                 |
  ---------------------------------------------------

  [ Recent Imports ]
  ---------------------------------------------------
  | Nov 2025 - DBS Visa       [View] [Re-import?]   |
  | Oct 2025 - POSB Savings   [View]               |
  | Sep 2025 - UOB One        [View]               |
  ---------------------------------------------------

Components (shadcn-style)

PageHeader

Title: Unfuck your finances.

Description: “Upload your statements, we’ll handle the mess.”

Upload card (<Card>):

Drag-and-drop zone (<Dropzone> or custom div)

Button – “Choose files”

Helper text: small, low-contrast, explicit about privacy.

Recent Imports (optional for M1 but useful for you & wife):

Table or a vertical list of Card rows

Each row: statement period, bank/account label, status chip (parsed, ingested, failed).

Actions: [View] (go to statement detail) and maybe [Re-run import] disabled in M1.

UX details

On file drop / selection:

Immediately show a modal or inline card with parsing progress (see next screen).

Multiple PDFs allowed in one go (optional for v1; you can start with 1).

2. Screen: Parsing / Progress

Purpose:
Give feedback while /api/statements/parse and the ingestion logic run.

You don’t need a separate page – you can show this as a state of the upload card.

[ Parsing your statement... ]

[ DBS_Statement_Nov_2025.pdf ]
[█████████-------]  63%

- Reading PDF in memory
- Detecting statement type
- Extracting transactions
- Sanitizing sensitive details

Components

Alert or Card with:

File name

Spinner or fake progress bar (you know it’s not exact, but users don’t care).

Status list: each step lights up as “done”:

✅ File received

✅ PDF parsed

✅ Transactions extracted

⏳ Checking for duplicates

UX

On success:

Automatically redirect to Review Import page with query param:
/imports/:statementId/review

On known errors:

Show friendly messages and a “Go back” or “Try another file” button.

Example copy:

“We only support text-based PDFs right now. This looks like a scanned image.”

“This file seems larger than 1 MB. Try downloading a lighter version.”

3. Screen: Review Import

Route: /imports/:statementId/review

Purpose:
Let the user accept new transactions and deal with duplicates without thinking too hard.

Layout
---------------------------------------------------------
[Back]  Review Import: DBS Visa — Nov 2025
---------------------------------------------------------

[ Statement Summary Card ]
---------------------------------------------------
Bank / Account: DBS Visa (ending 1234)
Period: 01 Nov 2025 – 30 Nov 2025
Currency: SGD
Found: 142 transactions
New: 98    •    Possible duplicates: 44
[ View all transactions (debug link, optional) ]
---------------------------------------------------

[ Section A: New Transactions ]
---------------------------------------------------
Header line: 
"98 new transactions will be added to your history."

[ Month: 2025-11 ]
-----------------------------------------------
| Date      | Description         | Amount    |
| 01 Nov    | GRAB *GRABTAXI      | 12.50     |
| 01 Nov    | NTUC FAIRPRICE      | 34.20     |
| 02 Nov    | SHOPEE *ORDER 123   | 89.90     |
| ...       |                     |           |
-----------------------------------------------

[Accept all new transactions]   [View fewer/more rows]
---------------------------------------------------

[ Section B: Potential Duplicates ]
---------------------------------------------------
Header:
"44 transactions look like they may already exist. 
We’ll keep your existing ones by default."

[ Duplicate row component ]
---------------------------------------------------
Existing (Kept): 
  01 Nov  | GRAB *GRABTAXI | 12.50 | Statement: Oct 2025

New (This file):
  01 Nov  | GRAB *GRABTAXI | 12.50 | Statement: Nov 2025

[○] Keep existing (skip this new one)   [●] Add as new anyway
--------------------------------------------------- (repeat list)
[Collapse duplicates section]
---------------------------------------------------

[ Footer actions ]
[Cancel]          [Finish Import]
---------------------------------------------------------

Components

Statement Summary Card

Card with key metadata.

Status chip for statement status (parsed, awaiting review, etc.).

Section A – New Transactions

Accordion for month buckets (if you later have multi-month).

Table:

Columns: Date, Description, Amount.

No pagination at first; just show first N with a “Show more” link.

Button (primary): “Accept all new transactions”

Section B – Duplicates

Accordion section that can be collapsed.

Each duplicate as a Card or row in Table:

Side-by-side existing vs new.

RadioGroup:

Default Keep existing.

Optional Add as new anyway.

Footer

Button variant="ghost": Cancel (returns to upload/home).

Button variant="default": Finish Import (commits to DB).

UX Behaviour

If there are zero duplicates, Section B is hidden completely.

On Finish Import:

You call backend to:

Mark accepted new ones as accepted.

Insert into transactions.

Mark statement as ingested.

Redirect to either:

"/transactions?month=2025-11" or

"/dashboard?month=2025-11"

4. Screen: Transactions List

Route: /transactions?month=YYYY-MM

Purpose:
Simple view of everything you’ve ingested, grouped by month. This is your “debug + power user” view.

Layout
---------------------------------------------------------
Transactions                          [Month: Nov 2025 ▼]
---------------------------------------------------------

[ Summary bar ]
Total for Nov 2025:  SGD 4,832.20
Files imported: 3 statements
[View by category] (disabled until M2/M3)

[ Table ]
-------------------------------------------------------------
| Date      | Description                    | Amount  | Src |
-------------------------------------------------------------
| 30 Nov    | NETS QR NTUC FAIRPRICE         | 45.20   | DBS |
| 29 Nov    | GRAB *GRABPAY TOPUP            | 50.00   | POSB|
| 29 Nov    | GRAB *GRABTAXI                 | 10.50   | DBS |
| 28 Nov    | SHOPEE *ORDER 839201           | 23.90   | DBS |
| ...       |                                |         |     |
-------------------------------------------------------------
[Prev month]                     [Next month]

Components

Filter bar

Select for Month (YYYY-MM list derived from transactions).

(Later) Select for Account/Bank, optional.

Summary bar

Simple text: not full analytics yet.

e.g. “Total: SGD X from N transactions.”

Table

Columns:

Date

Description

Amount

Source (bank short name or statement label)

Sorting:

Default: Date descending.

You can keep it read-only for now.

UX Notes

This is your “ground truth” view; if something feels off in the dashboard later, you debug here.

For your wife, this might be enough early on even without categories.

5. Screen: Month Summary (Stub for M3)

You might not implement this right away, but it’s useful to design it now so your data model aligns.

Route: /summary?month=YYYY-MM

---------------------------------------------------------
Month Summary — Nov 2025                    [Change month]
---------------------------------------------------------

[ Big number ]
"Your household spent SGD 4,832 in November 2025."

[ Breakdown (text-based for now) ]
- Food & Groceries: SGD 1,820 (37%)
- Bills & Utilities: SGD 1,450 (30%)
- Transport: SGD 480 (10%)
- Shopping: SGD 720 (15%)
- Others: SGD 362 (8%)

[ Narrative insight ]
"Compared to October 2025, you spent:
- +18% more on Eating Out
- -12% less on Transport
- about the same on Groceries"

[ Call to action ]
[See all transactions for this month]
[Upload another statement]


Implementation later:

After M2 categories exist.

Use simple queries and dumb text generation (no charts needed).

How to Use This Next

If you want to move efficiently:

Create routes/pages:

/ → Upload / Home

/imports/[statementId]/review

/transactions

/summary (stub)

Build just enough UI to support M1:

Upload

Parsing card

Review Import (Section A + Section B)

Transactions list

Wire them into your existing backend:

/api/statements/parse

Ingestion endpoint: something like /api/statements/:id/ingest