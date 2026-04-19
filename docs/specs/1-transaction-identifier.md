# Transaction Identifier Specification

## Changelog

| Date | Author | Description |
| :--- | :--- | :--- |
| 2026-04-19 | ebertulfo | Document implemented helpers, supported date formats, `defaultYear` fallback, and fail-fast error behaviour. |
| 2025-12-03 | ebertulfo | Initial draft defining the deterministic ID format |

## Overview

Each transaction extracted from a bank/credit card statement needs a unique identifier for deduplication purposes. This prevents duplicate imports when:
- The same statement is uploaded multiple times
- A transaction appears in multiple account sections within the same PDF
- Overlapping statement periods are imported

## Identifier Format

```
<date>-<amount>-<balance>-<descriptionHash>
```

### Components

| Component | Format | Example | Description |
|-----------|--------|---------|-------------|
| `date` | `YYYYMMDD` | `20240901` | Transaction date in sortable format |
| `amount` | Numeric string | `8104.86` | Transaction amount (no commas, with decimals) |
| `balance` | Numeric string | `4188.45` | Resulting balance after transaction |
| `descriptionHash` | 8 hex chars | `a1b2c3d4` | First 8 characters of SHA-256 hash of description |

### Example

For a transaction:
- Date: `01/09/2024`
- Description: `Advice Bill Payment DBSC-4119110095321011 : I-BANK VALUE DATE : 01/09/2024`
- Amount: `8,104.86`
- Balance: `4,188.45`

Generated ID: `20240901-8104.86-4188.45-a1b2c3d4`

## Why Include Description Hash?

The base format `<date>-<amount>-<balance>` handles most cases, but edge cases exist:
- Two transactions on the same day
- With the same amount
- Resulting in the same balance (extremely rare, but possible with offsetting transactions)

Adding the first 8 characters of a description hash provides additional uniqueness while keeping the ID reasonably short.

## Implementation Notes

Implementation lives in `lib/transaction-identifier.ts`. Exported surface:

- `generateTransactionIdentifier({ date, amount, balance, description, defaultYear? })` → `string`.
- `normalizeDateToYyyyMmDd(date, { defaultYear? })` → `string` (standalone helper, reused elsewhere).
- `normalizeAmount(value, field)` → `string` (two-decimal fixed, comma-stripped; throws on non-numeric input).

### Supported date formats

The date field may arrive in any of these shapes; normalization to `YYYYMMDD` happens inside the generator:

| Input shape | Example |
| :--- | :--- |
| `YYYYMMDD` (already normalized) | `20240901` |
| `YYYY-MM-DD` / `YYYY/MM/DD` | `2024-09-01` |
| `DD/MM/YYYY` / `DD-MM-YYYY` (2- or 4-digit year) | `01/09/2024`, `01-09-24` |
| `DD MMM YYYY` (case-insensitive month name) | `01 SEP 2024`, `1 September 24` |
| `DD MMM` (no year) — **requires** `defaultYear` | `19 SEP` + `defaultYear: 2024` |

Two-digit years are coerced to `2000 + YY`. Invalid calendar dates (e.g. `30 FEB 2024`) throw. Dates without a year and without `defaultYear` throw — callers should always pass the `defaultYear` inferred by the parser (`inferDefaultYearFromText`, see Spec 0).

### Normalization rules

- **Amount / balance**: commas stripped, whitespace trimmed, parsed via `Number()`, formatted with `.toFixed(2)`. Empty strings and non-numeric values throw with the offending field named in the error message.
- **Description**: `.trim()` only — internal whitespace is preserved so two visually-similar descriptions with different spacing still hash distinctly. (This is deliberate; if the parser wants descriptions collapsed, it should do so before calling the generator.)
- **Hash**: SHA-256 of the trimmed description, hex-encoded, first 8 characters.

### Example (end-to-end)

Input:
```ts
generateTransactionIdentifier({
  date: "01/09/2024",
  amount: "8,104.86",
  balance: "4,188.45",
  description: "Advice Bill Payment DBSC-4119110095321011 : I-BANK VALUE DATE : 01/09/2024",
})
```

Output: `20240901-8104.86-4188.45-<hash8>` where `<hash8>` is the first 8 hex chars of SHA-256 over the trimmed description.

### Storage

Stored as `transactions.transaction_identifier` (text) with a unique index on `(user_id, transaction_identifier)`. Same column exists on `transaction_imports` for staging — see Spec 2.

## Future Considerations

- If collisions are detected in practice, the hash portion can be extended to 16 characters (the format is prefix-stable, so older identifiers still compare equal under the current 8-char scheme).
- Account number could be prepended for multi-account scenarios: `<accountLast4>-<date>-<amount>-<balance>-<hash>`.
- The fact that the identifier embeds `balance` means a row replayed from a reprinted statement with an adjusted running balance would collide with itself under the account-number scheme but **not** under today's scheme. That's a known wart — re-importing a statement after the bank corrects a balance would look like a new transaction.
