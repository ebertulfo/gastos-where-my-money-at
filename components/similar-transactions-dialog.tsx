'use client'

import * as React from 'react'
import { Check, Loader2, MinusCircle, Search, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  bulkApplyCategory,
  bulkApplyLabel,
  bulkSetExcluded,
  findSimilarTransactions,
  type SimilarTransactionRow,
} from '@/app/actions/transactions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { CategoryOption } from '@/components/category-picker'
import type { Tag } from '@/db/schema'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

interface SimilarTransactionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Target row id — works for confirmed transactions and staged imports. */
  targetId: string
  targetDescription: string
  targetCurrency: string
  availableCategories: CategoryOption[]
  availableLabels: Tag[]
}

export function SimilarTransactionsDialog(props: SimilarTransactionsDialogProps) {
  const { open, onOpenChange, targetId } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {/* key forces a fresh fetch + reset on each open */}
        {open && <DialogBody key={targetId} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function DialogBody({
  onOpenChange,
  targetId,
  targetDescription,
  targetCurrency,
  availableCategories,
  availableLabels,
}: SimilarTransactionsDialogProps) {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [rows, setRows] = React.useState<SimilarTransactionRow[]>([])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [busyAction, setBusyAction] = React.useState<null | 'category' | 'label' | 'exclude' | 'include'>(null)

  React.useEffect(() => {
    let cancelled = false
    findSimilarTransactions(targetId)
      .then(result => {
        if (cancelled) return
        // Default selection: all confirmed-AI rows. User has already explicitly
        // confirmed any 'user'-source rows, so we don't pre-select those.
        const initial = new Set(
          result.filter(r => r.categorySource !== 'user').map(r => r.id),
        )
        setRows(result)
        setSelected(initial)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('findSimilarTransactions failed', err)
        toast.error('Failed to find similar transactions')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [targetId])

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = rows.length > 0 && selected.size === rows.length
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(rows.map(r => r.id)))
  }

  const ids = React.useMemo(() => Array.from(selected), [selected])

  const handleApplyCategory = async (categoryId: string | null) => {
    if (ids.length === 0) return
    setBusyAction('category')
    try {
      const { updated } = await bulkApplyCategory(ids, categoryId)
      toast.success(
        categoryId ? `Updated category on ${updated} rows` : `Cleared category on ${updated} rows`,
      )
      router.refresh()
      onOpenChange(false)
    } catch (err) {
      console.error('bulkApplyCategory failed', err)
      toast.error('Failed to apply category')
    } finally {
      setBusyAction(null)
    }
  }

  const handleApplyLabel = async (labelId: string) => {
    if (ids.length === 0) return
    setBusyAction('label')
    try {
      const { updated } = await bulkApplyLabel(ids, labelId)
      toast.success(`Added label to ${updated} rows`)
      router.refresh()
      onOpenChange(false)
    } catch (err) {
      console.error('bulkApplyLabel failed', err)
      toast.error('Failed to apply label')
    } finally {
      setBusyAction(null)
    }
  }

  const handleSetExcluded = async (isExcluded: boolean) => {
    if (ids.length === 0) return
    setBusyAction(isExcluded ? 'exclude' : 'include')
    try {
      const { updated } = await bulkSetExcluded(ids, isExcluded)
      toast.success(
        isExcluded ? `Excluded ${updated} rows from totals` : `Included ${updated} rows in totals`,
      )
      router.refresh()
      onOpenChange(false)
    } catch (err) {
      console.error('bulkSetExcluded failed', err)
      toast.error('Failed to update exclusion')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Find similar
          </DialogTitle>
          <DialogDescription className="truncate">
            Rows that look like <span className="font-medium text-foreground">{targetDescription}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching…
              </>
            ) : (
              <>
                <span>{rows.length} matches</span>
                {rows.length > 0 && <span>·</span>}
                {rows.length > 0 && <span>{selected.size} selected</span>}
              </>
            )}
          </div>
          {rows.length > 0 && (
            <Button variant="ghost" size="sm" onClick={toggleAll} className="h-7 text-xs">
              {allSelected ? 'Select none' : 'Select all'}
            </Button>
          )}
        </div>

        <div className="max-h-[360px] overflow-y-auto pr-1">
          {!loading && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No similar transactions found. Try lowering the threshold or run after more data is ingested.
            </p>
          )}
          {rows.map(row => (
            <SimilarRow
              key={row.id}
              row={row}
              checked={selected.has(row.id)}
              onToggle={() => toggleRow(row.id)}
              currency={targetCurrency}
              availableCategories={availableCategories}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Apply to {selected.size} selected
          </p>
          <div className="flex flex-wrap gap-2">
            <CategoryPickerPopover
              categories={availableCategories}
              disabled={selected.size === 0 || busyAction !== null}
              onPick={handleApplyCategory}
              loading={busyAction === 'category'}
            />
            <LabelPickerPopover
              labels={availableLabels}
              disabled={selected.size === 0 || busyAction !== null}
              onPick={handleApplyLabel}
              loading={busyAction === 'label'}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0 || busyAction !== null}
              onClick={() => handleSetExcluded(true)}
            >
              {busyAction === 'exclude' ? (
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              ) : (
                <MinusCircle className="h-3 w-3 mr-1.5" />
              )}
              Exclude
            </Button>
          </div>
        </div>
    </>
  )
}

interface SimilarRowProps {
  row: SimilarTransactionRow
  checked: boolean
  onToggle: () => void
  currency: string
  availableCategories: CategoryOption[]
}

function SimilarRow({ row, checked, onToggle, currency, availableCategories }: SimilarRowProps) {
  const cat = row.categoryId ? availableCategories.find(c => c.id === row.categoryId) : null
  const isAi = row.categorySource === 'ai'

  return (
    <label
      htmlFor={`sim-${row.id}`}
      className={cn(
        'flex cursor-pointer items-center gap-3 border-b py-2 px-1 last:border-b-0',
        'hover:bg-muted/40',
        row.isExcluded && 'opacity-60',
      )}
    >
      <Checkbox id={`sim-${row.id}`} checked={checked} onCheckedChange={onToggle} />
      <div className="flex flex-1 min-w-0 flex-col">
        <span className={cn('truncate text-sm', row.isExcluded && 'line-through')}>
          {row.description}
        </span>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{formatDate(row.date)}</span>
          {row.source && <span>· {row.source}</span>}
          {cat && (
            <Badge variant="outline" className="h-4 gap-1 px-1.5 text-[10px] font-normal">
              {isAi && <Sparkles className="h-2.5 w-2.5 text-primary/70" />}
              {cat.name}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-mono text-sm">
          {formatCurrency(Math.abs(row.amount), currency)}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {Math.round(row.similarity * 100)}% match
        </span>
      </div>
    </label>
  )
}

interface CategoryPickerPopoverProps {
  categories: CategoryOption[]
  disabled: boolean
  loading: boolean
  onPick: (categoryId: string | null) => void
}

function CategoryPickerPopover({ categories, disabled, loading, onPick }: CategoryPickerPopoverProps) {
  const [open, setOpen] = React.useState(false)
  const options = React.useMemo(() => buildCategoryOptions(categories), [categories])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          {loading ? (
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          ) : (
            <Check className="h-3 w-3 mr-1.5" />
          )}
          Set category
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search categories…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt.id}
                  value={opt.label}
                  onSelect={() => {
                    setOpen(false)
                    onPick(opt.id)
                  }}
                  className="text-xs"
                >
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup>
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  setOpen(false)
                  onPick(null)
                }}
                className="text-xs text-muted-foreground"
              >
                Clear category
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

interface LabelPickerPopoverProps {
  labels: Tag[]
  disabled: boolean
  loading: boolean
  onPick: (labelId: string) => void
}

function LabelPickerPopover({ labels, disabled, loading, onPick }: LabelPickerPopoverProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || labels.length === 0}>
          {loading ? (
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          ) : (
            <Check className="h-3 w-3 mr-1.5" />
          )}
          Add label
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search labels…" />
          <CommandList>
            <CommandEmpty>No labels yet. Create one from a row first.</CommandEmpty>
            <CommandGroup>
              {labels.map(lbl => (
                <CommandItem
                  key={lbl.id}
                  value={lbl.name}
                  onSelect={() => {
                    setOpen(false)
                    onPick(lbl.id)
                  }}
                  className="text-xs"
                >
                  {lbl.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function buildCategoryOptions(categories: CategoryOption[]): { id: string; label: string }[] {
  const byId = new Map(categories.map(c => [c.id, c]))
  return categories
    .map(c => {
      if (c.parent_id) {
        const parent = byId.get(c.parent_id)
        return { id: c.id, label: parent ? `${parent.name} / ${c.name}` : c.name }
      }
      return { id: c.id, label: c.name }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}
