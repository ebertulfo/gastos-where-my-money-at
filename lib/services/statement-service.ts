import type { Statement, Transaction, ImportReview, ImportDecisions, MonthSummary } from '@/lib/types/transaction'
import { mockStatements, mockTransactions, generateMockImportReview, getAvailableMonths } from './mock-data'

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Get all imported statements
 */
export async function getStatements(): Promise<Statement[]> {
    await delay(300)
    return mockStatements
}

/**
 * Get a single statement by ID
 */
export async function getStatement(id: string): Promise<Statement | null> {
    await delay(200)
    return mockStatements.find(s => s.id === id) || null
}

/**
 * Upload and parse a statement
 * Returns a statement ID that can be used for the review flow
 */
export async function uploadStatement(file: File): Promise<{ statementId: string }> {
    await delay(500)
    // Generate a mock statement ID
    const statementId = `stmt-${Date.now()}`
    return { statementId }
}

/**
 * Get parsing progress updates
 * In real implementation, this would be a streaming endpoint or WebSocket
 */
export type ParsingStep =
    | 'uploading'
    | 'reading'
    | 'detecting'
    | 'extracting'
    | 'sanitizing'
    | 'checking_duplicates'
    | 'complete'
    | 'error'

export async function* parseStatementProgress(statementId: string): AsyncGenerator<{
    step: ParsingStep
    progress: number
    error?: string
}> {
    const steps: { step: ParsingStep; progress: number; delay: number }[] = [
        { step: 'uploading', progress: 10, delay: 400 },
        { step: 'reading', progress: 25, delay: 600 },
        { step: 'detecting', progress: 40, delay: 400 },
        { step: 'extracting', progress: 65, delay: 800 },
        { step: 'sanitizing', progress: 85, delay: 400 },
        { step: 'checking_duplicates', progress: 95, delay: 500 },
        { step: 'complete', progress: 100, delay: 0 },
    ]

    for (const { step, progress, delay: stepDelay } of steps) {
        await delay(stepDelay)
        yield { step, progress }
    }
}

/**
 * Get import review data for a statement
 */
export async function getStatementReview(statementId: string): Promise<ImportReview> {
    await delay(400)
    return generateMockImportReview(statementId)
}

/**
 * Confirm import decisions
 */
export async function confirmImport(decisions: ImportDecisions): Promise<{ success: boolean }> {
    await delay(600)
    // In real implementation, this would update the database
    return { success: true }
}

/**
 * Get transactions, optionally filtered by month
 */
export async function getTransactions(month?: string): Promise<Transaction[]> {
    await delay(300)
    if (month) {
        return mockTransactions.filter(t => t.monthBucket === month)
    }
    return mockTransactions
}

/**
 * Get month summary
 */
export async function getMonthSummary(month: string): Promise<MonthSummary> {
    await delay(200)
    const transactions = mockTransactions.filter(t => t.monthBucket === month)
    const totalSpent = transactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    const statementIds = new Set(transactions.map(t => t.statementId))

    return {
        month,
        totalSpent,
        transactionCount: transactions.length,
        statementCount: statementIds.size,
        currency: 'SGD',
    }
}

/**
 * Get available months with transactions
 */
export async function getAvailableMonthsList(): Promise<string[]> {
    await delay(100)
    return getAvailableMonths()
}
