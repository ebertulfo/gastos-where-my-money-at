'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Transaction, MonthSummary } from '@/lib/types/transaction'
import { getTransactions, getMonthSummary, getAvailableMonthsList, getStatementsForMonth } from '@/app/actions/transactions'

interface UseTransactionsReturn {
    transactions: Transaction[]
    summary: MonthSummary | null
    availableMonths: string[]
    availableStatements: { id: string; label: string }[]
    selectedMonth: string | null
    setSelectedMonth: (month: string) => void
    isLoading: boolean
    error: string | null
    refetch: () => void
}

export function useTransactions(initialMonth?: string): UseTransactionsReturn {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [summary, setSummary] = useState<MonthSummary | null>(null)
    const [availableMonths, setAvailableMonths] = useState<string[]>([])
    const [availableStatements, setAvailableStatements] = useState<{ id: string; label: string }[]>([])
    const [selectedMonth, setSelectedMonth] = useState<string | null>(initialMonth || null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const searchParams = useSearchParams()
    const statementId = searchParams.get('statement')

    // Fetch available months on mount
    useEffect(() => {
        async function fetchMonths() {
            try {
                const months = await getAvailableMonthsList()
                setAvailableMonths(months)

                // Auto-select first month if none selected and not viewing specific statement
                if (!selectedMonth && months.length > 0 && !statementId) {
                    setSelectedMonth(months[0])
                } else if (months.length === 0) {
                    // No data available, stop loading
                    setIsLoading(false)
                }
            } catch (err) {
                console.error('Failed to fetch months:', err)
                setError('Failed to fetch available months')
                setIsLoading(false)
            }
        }

        fetchMonths()
    }, [selectedMonth, statementId])

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
    const fetchTransactions = useCallback(async () => {
        if (!selectedMonth && !statementId) return

        setIsLoading(true)
        setError(null)

        try {
            const [txns, monthSummary] = await Promise.all([
                getTransactions(selectedMonth, statementId || undefined),
                getMonthSummary(selectedMonth, statementId || undefined),
            ])

            setTransactions(txns)
            setSummary(monthSummary)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load transactions')
        } finally {
            setIsLoading(false)
        }
    }, [selectedMonth, statementId])

    useEffect(() => {
        fetchTransactions()
    }, [fetchTransactions])

    const refetch = useCallback(() => {
        fetchTransactions()
    }, [fetchTransactions])

    return {
        transactions,
        summary,
        availableMonths,
        availableStatements,
        selectedMonth,
        setSelectedMonth,
        isLoading,
        error,
        refetch,
    }
}
