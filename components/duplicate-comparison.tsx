'use client'

import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { Transaction, DuplicatePair } from '@/lib/types/transaction'

interface DuplicateComparisonProps {
    duplicate: DuplicatePair
    decision: 'keep_existing' | 'add_new'
    onDecisionChange: (decision: 'keep_existing' | 'add_new') => void
    className?: string
}

function TransactionPreview({
    transaction,
    label,
    isKept
}: {
    transaction: Transaction
    label: string
    isKept: boolean
}) {
    return (
        <div className={cn(
            'p-3 rounded-md border',
            isKept ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30'
        )}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{label}</span>
                {isKept && <Badge variant="default" className="text-xs">Kept</Badge>}
            </div>
            <div className="space-y-1">
                <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">{formatDate(transaction.date)}</span>
                    <span className={cn(
                        'font-mono text-sm',
                        transaction.amount < 0 ? 'text-destructive' : 'text-success'
                    )}>
                        {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
                    </span>
                </div>
                <p className="text-sm font-medium">{transaction.description}</p>
                <p className="text-xs text-muted-foreground">
                    Source: {transaction.source}
                </p>
            </div>
        </div>
    )
}

export function DuplicateComparison({
    duplicate,
    decision,
    onDecisionChange,
    className,
}: DuplicateComparisonProps) {
    return (
        <Card className={cn('', className)}>
            <CardContent className="p-4">
                <div className="grid gap-4 md:grid-cols-2 mb-4">
                    <TransactionPreview
                        transaction={duplicate.existing}
                        label="Existing (in your history)"
                        isKept={decision === 'keep_existing'}
                    />
                    <TransactionPreview
                        transaction={duplicate.new}
                        label="New (from this file)"
                        isKept={decision === 'add_new'}
                    />
                </div>

                <RadioGroup
                    value={decision}
                    onValueChange={(value) => onDecisionChange(value as 'keep_existing' | 'add_new')}
                    className="flex gap-4"
                >
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="keep_existing" id={`keep-${duplicate.existing.id}`} />
                        <Label
                            htmlFor={`keep-${duplicate.existing.id}`}
                            className="text-sm cursor-pointer"
                        >
                            Keep existing (skip new)
                        </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="add_new" id={`add-${duplicate.existing.id}`} />
                        <Label
                            htmlFor={`add-${duplicate.existing.id}`}
                            className="text-sm cursor-pointer"
                        >
                            Add as new anyway
                        </Label>
                    </div>
                </RadioGroup>
            </CardContent>
        </Card>
    )
}
