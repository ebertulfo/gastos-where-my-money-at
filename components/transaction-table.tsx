'use client'

import { assignTagsToTransaction } from '@/app/actions/tags'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import type { Tag } from '@/lib/supabase/database.types'
import type { Transaction } from '@/lib/types/transaction'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TagInput } from './ui/tag-input'

interface TransactionTableProps {
    transactions: Transaction[]
    availableTags: Tag[]
    showSource?: boolean
    className?: string
    emptyMessage?: string
    onTransactionUpdate?: (silent?: boolean) => void
    enableTagging?: boolean
}

export function TransactionTable({
    transactions,
    availableTags,
    showSource = true,
    className,
    emptyMessage = 'No transactions to display.',
    onTransactionUpdate,
    enableTagging = true,
}: TransactionTableProps) {
    if (transactions.length === 0) {
        return (
            <div className={cn('text-center py-12 text-muted-foreground', className)}>
                {emptyMessage}
            </div>
        )
    }

    const router = useRouter()

    const handleTagsChange = async (transactionId: string, newTagIds: string[]) => {
        try {
            await assignTagsToTransaction(transactionId, newTagIds)
            router.refresh() // Refetch server components
            if (onTransactionUpdate) {
                onTransactionUpdate(true) // Trigger manual refetch for client components (silent)
            }
        } catch (error) {
            console.error('Failed to update tags', error)
            // Ideally show toast
        }
    }

    return (
        <div className={cn('rounded-lg border', className)}>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[100px]">Date</TableHead>
                        <TableHead>Description</TableHead>
                        {enableTagging && <TableHead>Tags</TableHead>}
                        <TableHead className="text-right w-[120px]">Amount</TableHead>
                        {showSource && <TableHead className="w-[80px]">Source</TableHead>}
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.map((transaction) => (
                        <TransactionRow
                            key={transaction.id}
                            transaction={transaction}
                            showSource={showSource}
                            onUpdate={onTransactionUpdate}
                            enableTagging={enableTagging}
                            availableTags={availableTags}
                        />
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

import { useEffect, useState, useTransition } from 'react'

import { updateTransactionExclusion } from '@/app/actions/transactions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MinusCircle } from 'lucide-react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface TransactionRowProps {
    transaction: Transaction
    showSource: boolean
    onUpdate?: (silent?: boolean) => void
    enableTagging: boolean
    availableTags: Tag[]
}

function TransactionRow({
    transaction,
    showSource,
    onUpdate,
    enableTagging,
    availableTags
}: TransactionRowProps) {
    const router = useRouter()

    // Optimistic state
    const [isUpdating, setIsUpdating] = useState(false)
    const [isPending, startTransition] = useTransition()

    // Exclusion state
    const [isExcluded, setIsExcluded] = useState(transaction.isExcluded)
    const [exclusionReason, setExclusionReason] = useState(transaction.exclusionReason || '')
    const [isPopoverOpen, setIsPopoverOpen] = useState(false)

    // Sync state when props change
    useEffect(() => {
        setIsExcluded(transaction.isExcluded)
        setExclusionReason(transaction.exclusionReason || '')
    }, [transaction])

    const handleToggleExclusion = async () => {
        const newExcludedState = !isExcluded
        // Optimistic update
        setIsExcluded(newExcludedState)

        if (newExcludedState) {
            // Must provide reason? Optional.
            // Let's open popover to allow entering a reason if they want.
            setIsPopoverOpen(true)
        } else {
            // If turning OFF, clear reason
            setExclusionReason('')
        }

        try {
            await updateTransactionExclusion(transaction.id, newExcludedState, newExcludedState ? exclusionReason : undefined)

            startTransition(() => {
                router.refresh()
            })
            if (onUpdate) onUpdate(true)
        } catch (error) {
            console.error('Failed to update exclusion', error)
            // Revert
            setIsExcluded(!newExcludedState)
        }
    }

    const handleReasonUpdate = async (newReason: string) => {
        setExclusionReason(newReason)
        try {
            await updateTransactionExclusion(transaction.id, true, newReason)
            startTransition(() => {
                router.refresh()
            })
        } catch (error) {
            console.error('Failed to update reason', error)
        }
    }

    return (
        <TableRow className={cn(isExcluded && "opacity-60 bg-muted/30")}>
            <TableCell className="font-medium text-muted-foreground w-[100px]">
                {formatDate(transaction.date)}
            </TableCell>
            <TableCell className="font-medium">
                <div className="flex flex-col">
                    <span className={cn(isExcluded && "line-through text-muted-foreground")}>
                        {transaction.description}
                    </span>
                    {isExcluded && exclusionReason && (
                        <span className="text-xs text-muted-foreground italic">
                            Excluded: {exclusionReason}
                        </span>
                    )}
                </div>
            </TableCell>
            {enableTagging && (
                <TableCell className="w-[200px]">
                    <TagInput
                        selectedTags={transaction.tags}
                        availableTags={availableTags}
                        onTagsChange={async (newTagIds) => {
                            try {
                                const { assignTagsToTransaction } = await import('@/app/actions/tags')
                                await assignTagsToTransaction(transaction.id, newTagIds)
                                if (onUpdate) onUpdate(true)
                            } catch (e) {
                                console.error("Failed to update tags", e)
                            }
                        }}
                    />
                </TableCell>
            )}
            <TableCell className={cn(
                'text-right font-mono w-[120px]',
                transaction.amount < 0 ? 'text-destructive' : '',
                isExcluded && "text-muted-foreground line-through decoration-destructive/50"
            )}>
                {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
            </TableCell>
            {showSource && (
                <TableCell className="text-muted-foreground text-sm w-[80px]">
                    {transaction.statementId ? (
                        <Link href={`/transactions?statement=${transaction.statementId}`} className="hover:underline">
                            {transaction.source}
                        </Link>
                    ) : (
                        transaction.source
                    )}
                </TableCell>
            )}
            <TableCell className="w-[50px]">
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-8 w-8 hover:text-destructive",
                                isExcluded ? "text-destructive" : "text-muted-foreground/50"
                            )}
                            onClick={(e) => {
                                e.stopPropagation()
                                handleToggleExclusion()
                            }}
                        >
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <MinusCircle className="h-4 w-4" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{isExcluded ? "Include in total" : "Exclude from total"}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </Button>
                    </PopoverTrigger>
                    {isExcluded && (
                        <PopoverContent className="w-80" align="end" side="left">
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <h4 className="font-medium leading-none">Exclude Transaction</h4>
                                    <p className="text-sm text-muted-foreground">
                                        This transaction will not be counted in totals.
                                    </p>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="reason">Reason (Optional)</Label>
                                    <Input
                                        id="reason"
                                        defaultValue={exclusionReason}
                                        placeholder="e.g. Duplicate, Transfer"
                                        onBlur={(e) => handleReasonUpdate(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleReasonUpdate(e.currentTarget.value)
                                                setIsPopoverOpen(false)
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </PopoverContent>
                    )}
                </Popover>
            </TableCell>
        </TableRow>
    )
}
