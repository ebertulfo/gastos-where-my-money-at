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
    createdAt: string
}

export interface Statement {
    id: string
    bankName: string
    accountLabel?: string
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
}

export interface ImportReview {
    statement: Statement
    newTransactions: Transaction[]
    duplicates: DuplicatePair[]
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
