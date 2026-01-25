import { refreshTransactionData } from '@/app/actions/composite'
import { getTags } from '@/app/actions/tags'
import { getAvailableMonthsList, getStatementsForMonth } from '@/app/actions/transactions'
import { NavHeader } from '@/components/nav-header'
import { TransactionsView } from '@/components/transactions-view'
import { Loader2 } from 'lucide-react'
import { Suspense } from 'react'

interface Props {
  searchParams: Promise<{
    month?: string
    statement?: string
  }>
}

export default async function TransactionsPage({ searchParams }: Props) {
    const params = await searchParams;

    // 1. Fetch available months and tags (Global context)
    const [availableMonths, tags] = await Promise.all([
        getAvailableMonthsList(),
        getTags()
    ])

    // 2. Determine initial selection
    // Default to the most recent month if available
    const selectedMonth = params.month || (availableMonths.length > 0 ? availableMonths[0] : null)
    const statementId = params.statement || undefined

    // 3. Fetch Transaction Data for the selection
    const [transactionData, availableStatements] = await Promise.all([
        refreshTransactionData(selectedMonth, statementId),
        selectedMonth ? getStatementsForMonth(selectedMonth) : Promise.resolve([])
    ])

    return (
        <div className="min-h-screen bg-background">
            <NavHeader />

            <main>
                <Suspense fallback={
                    <div className="container py-8">
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    </div>
                }>
                    <TransactionsView
                        initialTransactions={transactionData.transactions}
                        initialSummary={transactionData.summary}
                        initialTags={tags}
                        availableMonths={availableMonths}
                        availableStatements={availableStatements}
                        selectedMonth={selectedMonth}
                    />
                </Suspense>
            </main>
        </div>
    )
}
