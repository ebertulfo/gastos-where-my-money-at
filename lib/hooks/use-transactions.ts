'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Transaction, MonthSummary } from '@/lib/types/transaction'
import type { Tag } from '@/lib/supabase/database.types'
import { getTransactions, getMonthSummary, getAvailableMonthsList, getStatementsForMonth } from '@/app/actions/transactions'
import { getTags } from '@/app/actions/tags'

interface UseTransactionsReturn {
    transactions: Transaction[]
    summary: MonthSummary | null
    availableMonths: string[]
    availableStatements: { id: string; label: string }[]
    availableTags: Tag[]
    selectedMonth: string | null
    setSelectedMonth: (month: string) => void
    isLoading: boolean
    error: string | null
    refetch: (silent?: boolean) => void
}

export function useTransactions(initialMonth?: string): UseTransactionsReturn {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [summary, setSummary] = useState<MonthSummary | null>(null)
    const [availableMonths, setAvailableMonths] = useState<string[]>([])
    const [availableStatements, setAvailableStatements] = useState<{ id: string; label: string }[]>([])
    const [availableTags, setAvailableTags] = useState<Tag[]>([])
    const [selectedMonth, setSelectedMonth] = useState<string | null>(initialMonth || null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const searchParams = useSearchParams()
    const statementId = searchParams.get('statement')


    // Fetch available months and tags on mount
    useEffect(() => {
        async function init() {
            try {
                const [months, tags] = await Promise.all([
                    getAvailableMonthsList(),
                    getTags()
                ])
                setAvailableMonths(months)
                setAvailableTags(tags)

                // Auto-select first month if none selected and not viewing specific statement
                // We use a functional update or ref if we want to avoid dep cycles, but checking initial state here is safe enough for mount effect
                if (!initialMonth && !statementId && months.length > 0) {
                     setSelectedMonth(months[0])
                } else if (months.length === 0) {
                    setIsLoading(false)
                }
            } catch (err) {
                console.error('Failed to init:', err)
                setError('Failed to fetch initial data')
                setIsLoading(false)
            }
        }

        init()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Empty dependency array to run only once


    // Load available statements when month changes
    useEffect(() => {
        async function loadStatements() {
            if (!selectedMonth) return
            try {
                const stmts = await getStatementsForMonth(selectedMonth)
                setAvailableStatements(stmts)
            } catch (err) {
                console.error("Failed to load statements", err)
            }
        }
        loadStatements()
    }, [selectedMonth])

    // Fetch transactions when month changes or statementId changes
    const fetchTransactions = useCallback(async (silent = false) => {
        if (!selectedMonth && !statementId) return

        if (!silent) setIsLoading(true)
        setError(null)

        try {
            const [txns, monthSummary, tags] = await Promise.all([
                getTransactions(selectedMonth, statementId || undefined),
                getMonthSummary(selectedMonth, statementId || undefined),
                getTags() // Always refresh tags to stay in sync with deletions
            ])

            setTransactions(txns)
            setSummary(monthSummary)
            setAvailableTags(tags) 
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load transactions')
        } finally {
            if (!silent) setIsLoading(false)
        }
    }, [selectedMonth, statementId])

    useEffect(() => {
        fetchTransactions()
    }, [fetchTransactions])

    const refetch = useCallback((silent = false) => {
        fetchTransactions(silent)
    }, [fetchTransactions])

    return {
        transactions,
        summary,
        availableMonths,
        availableStatements,
        availableTags,
        selectedMonth,
        setSelectedMonth,
        isLoading,
        error,
        refetch,
    }
}
