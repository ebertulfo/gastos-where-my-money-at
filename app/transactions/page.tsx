'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { NavHeader } from '@/components/nav-header'
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
import { useTransactions } from '@/lib/hooks/use-transactions'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

function formatMonthLabel(month: string): string {
    const [year, monthNum] = month.split('-')
    const date = new Date(parseInt(year), parseInt(monthNum) - 1)
    return date.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })
}

function TransactionsContent() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const {
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
    } = useTransactions()

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

    return (
        <div className="min-h-screen bg-background">
            <NavHeader />

            <main className="container py-8">
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
                {summary && (
                    <Card className="mb-8 animate-fade-in">
                        <CardContent className="p-6">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Spent</p>
                                    <p className="text-2xl font-bold text-foreground">
                                        {formatCurrency(summary.totalSpent, summary.currency)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Transactions</p>
                                    <p className="text-2xl font-bold text-foreground">
                                        {summary.transactionCount}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Files Imported</p>
                                    <p className="text-2xl font-bold text-foreground">
                                        {summary.statementCount} statements
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Transactions Table */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="text-center py-20">
                        <p className="text-destructive">{error}</p>
                    </div>
                ) : (
                    <TransactionTable
                        transactions={transactions}
                        availableTags={availableTags}
                        showSource={true}
                        className="animate-slide-up"
                        emptyMessage="No transactions for this month. Upload a statement to get started."
                        onTransactionUpdate={refetch}
                    />
                )}

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
            </main>
        </div>
    )
}

export default function TransactionsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-background">
                 <NavHeader />
                 <main className="container py-8">
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                 </main>
            </div>
        }>
            <TransactionsContent />
        </Suspense>
    )
}
