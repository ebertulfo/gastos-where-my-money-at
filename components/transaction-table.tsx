'use client'

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
import { toast } from 'sonner'
import { TagInput } from './ui/tag-input'
import { CategoryPicker, type CategoryOption } from './category-picker'

interface TransactionTableProps {
    transactions: Transaction[]
    availableTags: Tag[]
    /** All `kind='category'` rows for the user. Used by CategoryPicker. */
    availableCategories?: CategoryOption[]
    showSource?: boolean
    className?: string
    emptyMessage?: string
    onTransactionUpdate?: (silent?: boolean) => void
    enableTagging?: boolean
    /** Whether to show the singular category column. */
    enableCategory?: boolean
    onTagChangeOverride?: (transactionId: string, newTagIds: string[]) => Promise<void>
    /** Optional: review-screen path uses transaction_imports actions instead. */
    onCategoryChangeOverride?: (transactionId: string, categoryId: string | null) => Promise<void>
    onConfirmAiCategoryOverride?: (transactionId: string) => Promise<void>
}

export function TransactionTable({
    transactions,
    availableTags,
    availableCategories = [],
    showSource = true,
    className,
    emptyMessage = 'No transactions to display.',
    onTransactionUpdate,
    enableTagging = true,
    enableCategory = true,
    onTagChangeOverride,
    onCategoryChangeOverride,
    onConfirmAiCategoryOverride,
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
                        {enableCategory && <TableHead className="w-[180px]">Category</TableHead>}
                        {enableTagging && <TableHead className="w-[180px]">Labels</TableHead>}
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
                            enableCategory={enableCategory}
                            availableTags={availableTags}
                            availableCategories={availableCategories}
                            onTagChangeOverride={onTagChangeOverride}
                            onCategoryChangeOverride={onCategoryChangeOverride}
                            onConfirmAiCategoryOverride={onConfirmAiCategoryOverride}
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
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { MinusCircle, Plane } from 'lucide-react'

interface TransactionRowProps {
    transaction: Transaction
    showSource: boolean
    onUpdate?: (silent?: boolean) => void
    enableTagging: boolean
    enableCategory: boolean
    availableTags: Tag[]
    availableCategories: CategoryOption[]
    onTagChangeOverride?: (transactionId: string, newTagIds: string[]) => Promise<void>
    onCategoryChangeOverride?: (transactionId: string, categoryId: string | null) => Promise<void>
    onConfirmAiCategoryOverride?: (transactionId: string) => Promise<void>
}

function TransactionRow({
    transaction,
    showSource,
    onUpdate,
    enableTagging,
    enableCategory,
    availableTags,
    availableCategories,
    onTagChangeOverride,
    onCategoryChangeOverride,
    onConfirmAiCategoryOverride,
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
            setIsPopoverOpen(true)
        } else {
            setExclusionReason('')
        }

        try {
            await updateTransactionExclusion(transaction.id, newExcludedState, newExcludedState ? exclusionReason : undefined)
            toast.success(newExcludedState ? 'Excluded from totals' : 'Included in totals')

            startTransition(() => {
                router.refresh()
            })
            if (onUpdate) onUpdate(true)
        } catch (error) {
            console.error('Failed to update exclusion', error)
            toast.error('Failed to update exclusion')
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
            toast.error('Failed to update reason')
        }
    }

    return (
        <TableRow className={cn(isExcluded && "opacity-60 bg-muted/30")}>
            <TableCell className="font-medium text-muted-foreground w-[100px]">
                {formatDate(transaction.date)}
            </TableCell>
            <TableCell className="font-medium">
                <div className="flex flex-col">
                    <span className={cn('flex items-center gap-1.5', isExcluded && "line-through text-muted-foreground")}>
                        <TravelToggle
                            transactionId={transaction.id}
                            isTravel={transaction.isTravel}
                            onUpdate={() => onUpdate?.(true)}
                        />
                        <span>{transaction.description}</span>
                    </span>
                    {isExcluded && exclusionReason && (
                        <span className="text-xs text-muted-foreground italic">
                            Excluded: {exclusionReason}
                        </span>
                    )}
                </div>
            </TableCell>
            {enableCategory && (
                <TableCell className="w-[180px]">
                    <CategoryPicker
                        selectedId={transaction.category?.id ?? null}
                        source={transaction.categorySource}
                        categories={availableCategories}
                        onChange={async (categoryId) => {
                            if (onCategoryChangeOverride) {
                                await onCategoryChangeOverride(transaction.id, categoryId)
                                return
                            }
                            try {
                                const { setTransactionCategory } = await import('@/app/actions/categories')
                                await setTransactionCategory(transaction.id, categoryId)
                                toast.success(categoryId ? 'Category updated' : 'Category cleared')
                                if (onUpdate) onUpdate(true)
                            } catch (e) {
                                console.error('Failed to set category', e)
                                toast.error('Failed to update category')
                            }
                        }}
                        onConfirmAi={async () => {
                            if (onConfirmAiCategoryOverride) {
                                await onConfirmAiCategoryOverride(transaction.id)
                                return
                            }
                            try {
                                const { confirmAiCategory } = await import('@/app/actions/categories')
                                await confirmAiCategory(transaction.id)
                                toast.success('Category confirmed')
                                if (onUpdate) onUpdate(true)
                            } catch (e) {
                                console.error('Failed to confirm AI category', e)
                                toast.error('Failed to confirm category')
                            }
                        }}
                    />
                </TableCell>
            )}
            {enableTagging && (
                <TableCell className="w-[180px]">
                    <TagInput
                        selectedTags={transaction.tags}
                        availableTags={availableTags}
                        onTagsChange={async (newTagIds) => {
                            if (onTagChangeOverride) {
                                await onTagChangeOverride(transaction.id, newTagIds)
                                return
                            }

                            try {
                                const { assignTagsToTransaction } = await import('@/app/actions/tags')
                                await assignTagsToTransaction(transaction.id, newTagIds)
                                toast.success('Labels updated')
                                if (onUpdate) onUpdate(true)
                            } catch (e) {
                                console.error("Failed to update tags", e)
                                toast.error('Failed to update labels')
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

function TravelToggle({
    transactionId,
    isTravel,
    onUpdate,
}: {
    transactionId: string
    isTravel: boolean
    onUpdate?: () => void
}) {
    const router = useRouter()
    const [optimistic, setOptimistic] = useState(isTravel)
    const [busy, setBusy] = useState(false)

    useEffect(() => setOptimistic(isTravel), [isTravel])

    const handleToggle = async (e: { stopPropagation: () => void }) => {
        e.stopPropagation()
        if (busy) return
        const next = !optimistic
        setOptimistic(next)
        setBusy(true)
        try {
            const { setTransactionTravel } = await import('@/app/actions/transactions')
            await setTransactionTravel(transactionId, next)
            toast.success(next ? 'Marked as travel' : 'Removed travel mark')
            router.refresh()
            onUpdate?.()
        } catch (err) {
            console.error('Failed to toggle travel', err)
            toast.error('Failed to update travel')
            setOptimistic(!next)
        } finally {
            setBusy(false)
        }
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={handleToggle}
                        disabled={busy}
                        aria-label={optimistic ? 'Mark as non-travel' : 'Mark as travel'}
                        className={cn(
                            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors',
                            optimistic
                                ? 'text-primary hover:bg-primary/10'
                                : 'text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted',
                        )}
                    >
                        <Plane className="h-3.5 w-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{optimistic ? 'Travel spend — click to unmark' : 'Mark as travel'}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
