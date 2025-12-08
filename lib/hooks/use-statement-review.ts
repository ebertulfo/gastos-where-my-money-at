import { useState, useEffect, useCallback } from 'react'
import type { ImportReview, DuplicatePair } from '@/lib/types/transaction'
import { getReviewData, confirmStatementImport, deleteStatement } from '@/app/actions/statements'

type DuplicateDecisions = Record<string, 'keep_existing' | 'add_new'>

interface UseStatementReviewReturn {
    review: ImportReview | null
    isLoading: boolean
    error: string | null
    duplicateDecisions: DuplicateDecisions
    setDuplicateDecision: (importId: string, decision: 'keep_existing' | 'add_new') => void
    confirm: () => Promise<boolean>
    reject: () => Promise<boolean>
    isConfirming: boolean
    isRejecting: boolean
}

export function useStatementReview(statementId: string): UseStatementReviewReturn {
    const [review, setReview] = useState<ImportReview | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [duplicateDecisions, setDuplicateDecisions] = useState<DuplicateDecisions>({})
    const [isConfirming, setIsConfirming] = useState(false)
    const [isRejecting, setIsRejecting] = useState(false)

    // Fetch review data
    useEffect(() => {
        async function fetchReview() {
            setIsLoading(true)
            setError(null)

            try {
                const data = await getReviewData(statementId)
                setReview(data)

                // Initialize all duplicate decisions to 'keep_existing' by default
                const initialDecisions: DuplicateDecisions = {}
                data.duplicates.forEach((dup: DuplicatePair) => {
                    initialDecisions[dup.importId] = 'keep_existing'
                })
                setDuplicateDecisions(initialDecisions)
            } catch (err) {
                console.error("Fetch review error:", err)
                setError(err instanceof Error ? err.message : 'Failed to load review data')
            } finally {
                setIsLoading(false)
            }
        }

        fetchReview()
    }, [statementId])

    const setDuplicateDecision = useCallback((importId: string, decision: 'keep_existing' | 'add_new') => {
        setDuplicateDecisions(prev => ({
            ...prev,
            [importId]: decision,
        }))
    }, [])

    const confirm = useCallback(async (): Promise<boolean> => {
        if (!review) return false

        setIsConfirming(true)
        setError(null)

        try {
            // Build the decisions payload
            const decisions = [
                // Accept all new transactions
                ...review.newTransactions.map(t => ({
                    importId: t.id,
                    action: 'accept' as const,
                })),
                // Handle duplicates based on user decisions
                ...review.duplicates.map(dup => ({
                    importId: dup.importId,
                    action: duplicateDecisions[dup.importId] === 'add_new' ? 'accept' as const : 'reject' as const,
                })),
            ]

            const result = await confirmStatementImport(statementId, decisions)

            if (!result.success) {
                throw new Error(result.error || 'Failed to confirm import')
            }

            return true
        } catch (err) {
            console.error("Confirm error:", err)
            setError(err instanceof Error ? err.message : 'Failed to confirm import')
            return false
        } finally {
            setIsConfirming(false)
        }
    }, [review, duplicateDecisions, statementId])

    const reject = useCallback(async (): Promise<boolean> => {
        setIsRejecting(true)
        setError(null)
        try {
            const result = await deleteStatement(statementId)
            if (!result.success) {
                throw new Error(result.error || 'Failed to delete statement')
            }
            return true
        } catch (err) {
            console.error("Reject error:", err)
            setError(err instanceof Error ? err.message : 'Failed to delete statement')
            return false
        } finally {
            setIsRejecting(false)
        }
    }, [statementId])

    return {
        review,
        isLoading,
        error,
        duplicateDecisions,
        setDuplicateDecision,
        confirm,
        reject,
        isConfirming,
        isRejecting,
    }
}
