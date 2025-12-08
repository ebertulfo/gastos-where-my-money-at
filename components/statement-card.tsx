import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn, formatDate } from '@/lib/utils'
import { Eye, FileText } from 'lucide-react'
import Link from 'next/link'

export type StatementStatus = 'parsed' | 'reviewing' | 'ingested' | 'failed'

interface StatementCardProps {
    id: string
    bankName: string
    accountLabel?: string
    periodStart: string
    periodEnd: string
    transactionCount?: number
    status: StatementStatus
    className?: string
}

const statusConfig: Record<StatementStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    parsed: { label: 'Parsed', variant: 'secondary' },
    reviewing: { label: 'Reviewing', variant: 'outline' },
    ingested: { label: 'Imported', variant: 'default' },
    failed: { label: 'Failed', variant: 'destructive' },
}

export function StatementCard({
    id,
    bankName,
    accountLabel,
    periodStart,
    periodEnd,
    transactionCount,
    status,
    className,
}: StatementCardProps) {
    const { label, variant } = statusConfig[status]
    const period = `${formatDate(periodStart)} – ${formatDate(periodEnd)}`

    return (
        <Card className={cn('hover:bg-subtle-bg transition-colors', className)}>
            <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-foreground">
                                {bankName}
                                {accountLabel && <span className="text-muted-foreground"> ({accountLabel})</span>}
                            </h3>
                            <Badge variant={variant}>{label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {period}
                            {transactionCount !== undefined && (
                                <span className="ml-2">• {transactionCount} transactions</span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {status === 'reviewing' ? (
                        <Button asChild size="sm">
                            <Link href={`/imports/${id}/review`}>
                                Review
                            </Link>
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" asChild>
                            <Link href={`/transactions?statement=${id}`}>
                                <Eye className="h-4 w-4 mr-1" />
                                View
                            </Link>
                        </Button>
                    )}
                    
                    <DeleteStatementDialog id={id} transactionCount={transactionCount} />
                </div>
            </CardContent>
        </Card>
    )
}

import { deleteStatement } from '@/app/actions/statements'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

function DeleteStatementDialog({ id, transactionCount }: { id: string, transactionCount?: number }) {
    const [open, setOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            await deleteStatement(id)
            setOpen(false)
        } catch (error) {
            console.error('Failed to delete statement', error)
            setIsDeleting(false)
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Statement?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete this statement
                        {transactionCount ? ` and its ${transactionCount} transactions` : ''}.
                        This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={(e) => {
                            e.preventDefault()
                            handleDelete()
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={isDeleting}
                    >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
