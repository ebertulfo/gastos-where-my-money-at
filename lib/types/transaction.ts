export interface TransactionCategory {
    id: string
    name: string
    /** Top-level parent name when this is a sub-category. Drives the rollup display "Food / Groceries". */
    parentName: string | null
    color: string | null
}

export interface Transaction {
    id: string
    date: string
    description: string
    amount: number
    currency: string
    source: string
    monthBucket: string // YYYY-MM format
    transactionIdentifier: string
    statementId: string
    isExcluded: boolean
    exclusionReason?: string
    /** The single category bucket (where the money went). null = uncategorized. */
    category: TransactionCategory | null
    /** 'user' = user picked / confirmed; 'ai' = auto-applied at ingest, awaiting confirmation. */
    categorySource: 'user' | 'ai' | null
    /** Foreign-currency / overseas-spend flag. Future: groups into named trips. */
    isTravel: boolean
    /** Free-form labels (formerly tags). User-driven, multi-select. */
    tags: { id: string; name: string; color: string | null }[]
    createdAt: string
}

export interface Statement {
    id: string
    bankName: string
    /** Raw bank slug as stored on the row. Edit dialog writes through this; display uses bankName. */
    bankRaw: string | null
    accountLabel?: string
    statementType: 'debit' | 'credit' | 'investment'
    periodStart: string
    periodEnd: string
    currency: string
    /** Opening balance printed on the statement (debit/investment only). null = none/credit-card. */
    previousBalance: number | null
    transactionCount: number
    status: 'parsed' | 'reviewing' | 'ingested' | 'failed'
    fileHash: string
    createdAt: string
}

export interface TransactionImport {
    id: string
    statementId: string
    transaction: Transaction
    status: 'pending' | 'accepted' | 'rejected'
    existingTransactionId?: string // If set, this is a potential duplicate
    createdAt: string
}

export interface DuplicatePair {
    existing: Transaction
    new: Transaction
    importId: string
    initialDecision?: 'keep_existing' | 'add_new'
}

/**
 * Parser-integrity reconciliation surfaced on the review screen. Compares
 * the figure printed on the statement against the sum of extracted rows
 * so the user knows the parser didn't miss anything before they accept
 * the import.
 *
 * status:
 *   match — within tolerance ($0.50). Banner is green ✓.
 *   mismatch — outside tolerance. Banner is yellow ⚠ with the diff.
 *   unavailable — statement didn't surface a reconcilable figure.
 *
 * extractedTotal is signed for credit cards (so refunds reduce the sum)
 * and absolute for bank withdrawals (so the parser's debit-only output
 * lines up with the statement's withdrawals total).
 */
export interface StatementReconciliation {
    status: 'match' | 'mismatch' | 'unavailable'
    expectedTotal: number | null
    expectedTotalKind: 'cc_new_charges_signed' | 'bank_withdrawals_abs' | null
    extractedTotal: number | null
    diff: number | null
    currency: string
}

export interface ImportReview {
    statement: Statement
    newTransactions: Transaction[]
    duplicates: DuplicatePair[]
    reconciliation: StatementReconciliation
}

export interface ImportDecision {
    importId: string
    action: 'accept' | 'reject'
}

export interface ImportDecisions {
    statementId: string
    decisions: ImportDecision[]
}

export interface MonthSummary {
    month: string // YYYY-MM
    totalSpent: number
    transactionCount: number
    statementCount: number
    currency: string
}
