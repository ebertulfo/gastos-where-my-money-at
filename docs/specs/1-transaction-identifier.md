# Transaction Identifier Specification

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

1. **Normalization**: Always normalize amounts and balances by removing commas before generating the ID
2. **Description cleaning**: Trim whitespace from description before hashing
3. **Hash algorithm**: Use SHA-256 for consistency, truncate to first 8 hex characters
4. **Storage**: Store the full ID as a string field on the transaction record

## Future Considerations

- If collisions are detected in practice, the hash portion can be extended to 16 characters
- Account number could be prepended for multi-account scenarios: `<accountLast4>-<date>-<amount>-<balance>-<hash>`
