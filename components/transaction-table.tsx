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
                        <TableHead className="w-[300px]">Tags</TableHead>
                        <TableHead className="text-right w-[120px]">Amount</TableHead>
                        {showSource && <TableHead className="w-[80px]">Source</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.map((transaction) => (
                        <TransactionRow
                            key={transaction.id}
                            transaction={transaction}
                            availableTags={availableTags}
                            showSource={showSource}
                            enableTagging={enableTagging}
                            onUpdate={onTransactionUpdate}
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
import { Eye, EyeOff } from 'lucide-react'

interface TransactionRowProps {
    transaction: Transaction
    availableTags: Tag[]
    showSource: boolean
    enableTagging: boolean
    onUpdate?: (silent?: boolean) => void
}

function TransactionRow({ 
    transaction, 
    availableTags, 
    showSource, 
    enableTagging, 
    onUpdate 
}: TransactionRowProps) {
    const router = useRouter()
    // Optimistic state
    const [tags, setTags] = useState(transaction.tags)
    const [localTags, setLocalTags] = useState<Tag[]>(availableTags)

    const [isUpdating, setIsUpdating] = useState(false)
    const [isPending, startTransition] = useTransition()

    // Exclusion state
    const [isExcluded, setIsExcluded] = useState(transaction.isExcluded)
    const [exclusionReason, setExclusionReason] = useState(transaction.exclusionReason || '')
    const [isPopoverOpen, setIsPopoverOpen] = useState(false)

    // Sync state when props change
    useEffect(() => {
        setTags(transaction.tags)
        setIsExcluded(transaction.isExcluded)
        setExclusionReason(transaction.exclusionReason || '')
    }, [transaction])

    useEffect(() => {
        const newTags = availableTags.filter(at => !localTags.some(lt => lt.id === at.id))
        if (newTags.length > 0) {
            setLocalTags(prev => [...prev, ...newTags])
        }
    }, [availableTags])

    const handleTagsChange = async (newTagIds: string[]) => {
        setIsUpdating(true)
        try {
            await assignTagsToTransaction(transaction.id, newTagIds)
            startTransition(() => {
                router.refresh()
            })
            if (onUpdate) onUpdate(true) 
            setIsUpdating(false)
        } catch (error) {
            console.error('Failed to update tags', error)
            setIsUpdating(false)
        }
    }

    const handleToggleExclusion = async () => {
        const newExcludedState = !isExcluded
        // Optimistic update
        setIsExcluded(newExcludedState)
        
        if (newExcludedState) {
            // If turning ON, open popover to allow reason input (but generic reason isn't strictly required by DB)
            setIsPopoverOpen(true)
        } else {
             // If turning OFF, clear reason
            setExclusionReason('')
        }

        try {
            // We pass the current exclusionReason if enabling, but if enabling via toggle, maybe we wait for popover close?
            // Actually, let's update immediately with empty reason, and update again if they type one?
            // Or only update when they close popover / confirm?
            // Better UX: Toggle immediately. If they type reason, it auto-saves or saves on blur.
            
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
            // No need to refresh entire list heavily for just reason text, but good for consistency
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
            <TableCell>
                {enableTagging ? (
                    <TagInput 
                        selectedTags={tags}
                        availableTags={localTags}
                        onTagsChange={(tagIds) => handleTagsChange(tagIds)}
                        isLoading={isUpdating || isPending}
                        disabled={isExcluded} // Disable tagging if excluded? Maybe optional.
                        onTagDelete={() => {
                            router.refresh()
                            if (onUpdate) onUpdate(true)
                        }}
                    />
                ) : (
                    <span className="text-muted-foreground text-sm italic">Import to tag</span>
                )}
            </TableCell>
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
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                                // Default behavior fits, but we want to intercept ONLY if we want to toggle.
                                // PopoverTrigger usually toggles state.
                                // We want the button to Toggle Exclusion. 
                                // If it becomes Excluded, Show Popover.
                                // If it is Excluded and we click, do we un-exclude? Or open popover?
                                // Let's separate actions: Click Icon to Toggle. 
                                // But PopoverTrigger wraps the button. 
                                // Strategy: Button toggles. If excluded, meaningful generic "Settings" or explicit "Hidden" state.
                                // Simplified: Just use the button to toggle. If ON, we manually open popover via state.
                                e.stopPropagation()
                                handleToggleExclusion()
                            }}
                        >
                            {isExcluded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 opacity-25 hover:opacity-100" />}
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
