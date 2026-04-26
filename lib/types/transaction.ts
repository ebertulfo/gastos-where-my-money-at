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
    tags: { id: string; name: string; color: string | null }[]
    createdAt: string
}

export interface Statement {
    id: string
    bankName: string
    accountLabel?: string
    statementType: 'debit' | 'credit' | 'investment'
    periodStart: string
    periodEnd: string
    currency: string
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
