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
 */
export async function uploadStatement(file: File, token?: string): Promise<{ statementId: string; isDuplicate?: boolean }> {
    const formData = new FormData()
    formData.append('file', file)

    const headers: HeadersInit = {}
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch('/api/statements/ingest', {
        method: 'POST',
        headers,
        body: formData,
    })

    if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to upload statement')
    }

    return response.json()
}

/**
 * Get parsing progress updates (Simulated for now as API is sync)
 */
export type ParsingStep =
    | 'uploading'
    | 'processing'
    | 'complete'
    | 'error'

export async function* parseStatementProgress(statementId: string): AsyncGenerator<{
    step: ParsingStep
    progress: number
    error?: string
}> {
    // fast simulation
    yield { step: 'uploading', progress: 50 };
    await delay(500);
    yield { step: 'processing', progress: 90 };
    // The API call usually completes before this finishes if it's fast, 
    // but since we call this AFTER upload returns in the hook (which is wrong now),
    // we need to refactor the hook.
    // Actually, the hook calls uploadStatement, awaits it, THEN calls parseStatementProgress.
    // If uploadStatement is sync and does everything, we don't need this generator anymore.
    // But to keep UI happy without big refactor, we can just yield complete immediately.
    yield { step: 'complete', progress: 100 };
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
