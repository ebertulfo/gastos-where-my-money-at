import { cn, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Eye, RotateCcw } from 'lucide-react'
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
                    {status === 'ingested' && (
                        <Button variant="ghost" size="sm" disabled title="Re-import coming soon">
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
