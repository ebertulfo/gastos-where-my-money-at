'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Transaction, MonthSummary } from '@/lib/types/transaction'
import { getTransactions, getMonthSummary, getAvailableMonthsList } from '@/lib/services/statement-service'

interface UseTransactionsReturn {
    transactions: Transaction[]
    summary: MonthSummary | null
    availableMonths: string[]
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
    const [selectedMonth, setSelectedMonth] = useState<string | null>(initialMonth || null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Fetch available months on mount
    useEffect(() => {
        async function fetchMonths() {
            try {
                const months = await getAvailableMonthsList()
                setAvailableMonths(months)

                // Auto-select first month if none selected
                if (!selectedMonth && months.length > 0) {
                    setSelectedMonth(months[0])
                }
            } catch (err) {
                console.error('Failed to fetch months:', err)
            }
        }

        fetchMonths()
    }, [selectedMonth])

    // Fetch transactions when month changes
    const fetchTransactions = useCallback(async () => {
        if (!selectedMonth) return

        setIsLoading(true)
        setError(null)

        try {
            const [txns, monthSummary] = await Promise.all([
                getTransactions(selectedMonth),
                getMonthSummary(selectedMonth),
            ])

            setTransactions(txns)
            setSummary(monthSummary)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load transactions')
        } finally {
            setIsLoading(false)
        }
    }, [selectedMonth])

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
        selectedMonth,
        setSelectedMonth,
        isLoading,
        error,
        refetch,
    }
}
