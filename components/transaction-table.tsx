import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import type { Transaction } from '@/lib/types/transaction'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'

interface TransactionTableProps {
    transactions: Transaction[]
    showSource?: boolean
    className?: string
    emptyMessage?: string
}

export function TransactionTable({
    transactions,
    showSource = true,
    className,
    emptyMessage = 'No transactions to display.',
}: TransactionTableProps) {
    if (transactions.length === 0) {
        return (
            <div className={cn('text-center py-12 text-muted-foreground', className)}>
                {emptyMessage}
            </div>
        )
    }

    return (
        <div className={cn('rounded-lg border', className)}>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[100px]">Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right w-[120px]">Amount</TableHead>
                        {showSource && <TableHead className="w-[80px]">Source</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                            <TableCell className="font-medium text-muted-foreground">
                                {formatDate(transaction.date)}
                            </TableCell>
                            <TableCell className="font-medium">
                                {transaction.description}
                            </TableCell>
                            <TableCell className={cn(
                                'text-right font-mono',
                                transaction.amount < 0 ? 'text-destructive' : ''
                            )}>
                                {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
                            </TableCell>
                            {showSource && (
                                <TableCell className="text-muted-foreground text-sm">
                                    {transaction.statementId ? (
                                        <Link href={`/transactions?statement=${transaction.statementId}`} className="hover:underline">
                                           {transaction.source}
                                        </Link>
                                    ) : (
                                        transaction.source
                                    )}
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
