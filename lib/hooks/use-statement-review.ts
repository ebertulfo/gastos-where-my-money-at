'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ImportReview, DuplicatePair } from '@/lib/types/transaction'
import { getStatementReview, confirmImport } from '@/lib/services/statement-service'

type DuplicateDecisions = Record<string, 'keep_existing' | 'add_new'>

interface UseStatementReviewReturn {
    review: ImportReview | null
    isLoading: boolean
    error: string | null
    duplicateDecisions: DuplicateDecisions
    setDuplicateDecision: (importId: string, decision: 'keep_existing' | 'add_new') => void
    confirm: () => Promise<boolean>
    isConfirming: boolean
}

export function useStatementReview(statementId: string): UseStatementReviewReturn {
    const [review, setReview] = useState<ImportReview | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [duplicateDecisions, setDuplicateDecisions] = useState<DuplicateDecisions>({})
    const [isConfirming, setIsConfirming] = useState(false)

    // Fetch review data
    useEffect(() => {
        async function fetchReview() {
            setIsLoading(true)
            setError(null)

            try {
                const data = await getStatementReview(statementId)
                setReview(data)

                // Initialize all duplicate decisions to 'keep_existing' by default
                const initialDecisions: DuplicateDecisions = {}
                data.duplicates.forEach((dup: DuplicatePair) => {
                    initialDecisions[dup.importId] = 'keep_existing'
                })
                setDuplicateDecisions(initialDecisions)
            } catch (err) {
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

            const result = await confirmImport({
                statementId,
                decisions,
            })

            return result.success
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to confirm import')
            return false
        } finally {
            setIsConfirming(false)
        }
    }, [review, duplicateDecisions, statementId])

    return {
        review,
        isLoading,
        error,
        duplicateDecisions,
        setDuplicateDecision,
        confirm,
        isConfirming,
    }
}
