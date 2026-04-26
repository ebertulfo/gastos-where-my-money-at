# Gastos Together: KISS (Keep It Simple Stupid)
## Why?
One household, at least 2 bank statements. 1 bank statement for partner 1, 1 bank statement for partner 2.

Both partners have credit cards, 2 more statements.

Enter Gastos Together.

Give all your houshold statements. System removes sensitive information and extracts all transactions from statements. All transactions gets assigned tags and metadata. You can now see where your money went.

## User Flow
1. Upload Statement
2. Redact sensitive information from statement
3. Extract transactions from redacted statement
4. Ask user to review transactions to exclude those that are NOT spend (e.g. transfer between accounts, payment for credit cards, etc.)
5. All transactions get a category (AI suggests at ingest, you confirm or override on the review screen) and optional free-form labels. Foreign-currency spend is auto-flagged as travel. Categories are singular, hierarchical, and country-seeded; labels are many-per-row and user-driven.
6. Reports and Insights can now be viewed. Per statement, per person, per month, per year, or a combo. Drill into a category to see the underlying transactions. Know where you spend most of your money.