'use client'

import { TransactionTable } from '@/components/transaction-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { startTransition, useOptimistic } from 'react'

// Types
import { assignTagsToTransaction } from '@/app/actions/tags'
import type { Tag } from '@/lib/supabase/database.types'
import type { MonthSummary, Transaction } from '@/lib/types/transaction'

interface TransactionsViewProps {
    initialTransactions: Transaction[]
    initialSummary: MonthSummary
    initialTags: Tag[]
    availableMonths: string[]
    availableStatements: { id: string; label: string }[]
    selectedMonth: string | null
}

function formatMonthLabel(month: string): string {
    const [year, monthNum] = month.split('-')
    const date = new Date(parseInt(year), parseInt(monthNum) - 1)
    return date.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })
}

export function TransactionsView({
    initialTransactions,
    initialSummary,
    initialTags,
    availableMonths,
    availableStatements,
    selectedMonth
}: TransactionsViewProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    // Optimistic UI for Transactions
    // We use useOptimistic to show instantaneous updates
    const [optimisticTransactions, setOptimisticTransactions] = useOptimistic(
        initialTransactions,
        (state: Transaction[], updatedTransaction: { id: string; tags: any[] }) => {
            return state.map(t => 
                t.id === updatedTransaction.id 
                    ? { ...t, tags: updatedTransaction.tags } 
                    : t
            )
        }
    )

    // Navigation handlers
    const setSelectedMonth = (month: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('month', month)
        router.push(`${pathname}?${params.toString()}`)
    }

    const currentMonthIndex = selectedMonth ? availableMonths.indexOf(selectedMonth) : -1
    const hasPrevMonth = currentMonthIndex < availableMonths.length - 1
    const hasNextMonth = currentMonthIndex > 0

    const goToPrevMonth = () => {
        if (hasPrevMonth) {
            setSelectedMonth(availableMonths[currentMonthIndex + 1])
        }
    }

    const goToNextMonth = () => {
        if (hasNextMonth) {
            setSelectedMonth(availableMonths[currentMonthIndex - 1])
        }
    }

    // Handle Tag Changes with Optimistic UI
    const handleTagChange = async (transactionId: string, newTagIds: string[]) => {
        // 1. Calculate new tags for optimistic update
        const newTags = initialTags.filter(tag => newTagIds.includes(tag.id)).map(tag => ({
            id: tag.id,
            name: tag.name,
            color: tag.color
        }))

        // 2. Apply optimistic update
        startTransition(() => {
             setOptimisticTransactions({ id: transactionId, tags: newTags })
        })

        // 3. Perform server mutation
        try {
            await assignTagsToTransaction(transactionId, newTagIds)
            // 4. Refresh to sync with server (background)
            router.refresh()
        } catch (error) {
            console.error("Failed to update tags", error)
            // In a real app, we might want to revert the optimistic state via a key reset or toast
        }
    }

    // Since we are using router.refresh, loading state is handled by Next.js loading.js or Suspense fallback
    // But for local interactions like tagging, it's instant.

    // We need to pass a custom handler to TransactionTable to bypass its default internal logic
    // But TransactionTable uses TransactionRow which uses TagInput.
    // We can pass `onTransactionUpdate` to trigger refresh, but that's for the old way.
    // The cleanest way (without rewriting Table/Row significantly) would be to let Row do the mutation?
    // No, we want Optimistic UI.
    
    // We will pass the optimistic transactions to the table.
    // AND we need to intercept the tag update.
    // Current TransactionTable accepts `onTransactionUpdate` but that is called AFTER mutation.
    // We need `onTagsChange` prop on TransactionTable -> Row.
    
    // For this step, I will assume we modify TransactionTable/Row to accept an external handler `onTagsChange`
    // If not, revert to standard non-optimistic refetch for now.
    // Let's modify TransactionTable/Row next to accept `onTagsChange`.

    // TEMP: I will define a wrapper for now to pass to TransactionTable if we modify it.
    
    return (
        <div className="container py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold">Transactions</h1>
                <div className="flex gap-4">
                    {availableStatements.length > 0 && (
                        <Select
                            value={searchParams.get('statement') || 'all'}
                            onValueChange={(value) => {
                                const params = new URLSearchParams(searchParams.toString())
                                if (value === 'all') {
                                    params.delete('statement')
                                } else {
                                    params.set('statement', value)
                                }
                                router.push(`${pathname}?${params.toString()}`)
                            }}
                        >
                            <SelectTrigger className="w-[240px]">
                                <SelectValue placeholder="All Statements" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statements</SelectItem>
                                {availableStatements.map((stmt) => (
                                    <SelectItem key={stmt.id} value={stmt.id}>
                                        {stmt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    <Select value={selectedMonth || ''} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select month" />
                        </SelectTrigger>
                        <SelectContent>
                            {availableMonths.map((month) => (
                                <SelectItem key={month} value={month}>
                                    {formatMonthLabel(month)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Summary Bar */}
            {initialSummary && (
                <Card className="mb-8 animate-fade-in">
                    <CardContent className="p-6">
                        <div className="grid gap-4 md:grid-cols-3">
                            <div>
                                <p className="text-sm text-muted-foreground">Total Spent</p>
                                <p className="text-2xl font-bold text-foreground">
                                    {formatCurrency(initialSummary.totalSpent, initialSummary.currency)}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Transactions</p>
                                <p className="text-2xl font-bold text-foreground">
                                    {initialSummary.transactionCount}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Files Imported</p>
                                <p className="text-2xl font-bold text-foreground">
                                    {initialSummary.statementCount} statements
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Transactions Table */}
            <TransactionTable
                transactions={optimisticTransactions}
                availableTags={initialTags}
                showSource={true}
                className="animate-slide-up"
                emptyMessage="No transactions for this month. Upload a statement to get started."
                // Only trigger refresh for non-optimistic actions (like exclusion)
                // For tagging, we want to intercept.
                onTransactionUpdate={() => router.refresh()}
                
                // We need to extend TransactionTable to accept this
                onTagChangeOverride={handleTagChange}
            />

            {/* Pagination */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t">
                <Button
                    variant="ghost"
                    onClick={goToPrevMonth}
                    disabled={!hasPrevMonth}
                >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous month
                </Button>
                <Button
                    variant="ghost"
                    onClick={goToNextMonth}
                    disabled={!hasNextMonth}
                >
                    Next month
                    <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
            </div>
        </div>
    )
}
