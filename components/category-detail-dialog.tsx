'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { TransactionTable } from '@/components/transaction-table'
import type { CategoryOption } from '@/components/category-picker'
import type { Tag } from '@/db/schema'
import type { Transaction } from '@/lib/types/transaction'
import type { InsightsFilters, InsightsPeriod } from '@/lib/types/insights'
import { formatCurrency } from '@/lib/utils'
import { getTransactionsForCategoryRollup } from '@/app/actions/transactions'

interface CategoryDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Top-level category being drilled into. Use the rollup row's tagId; null for the Uncategorized bucket. */
  rollupCategoryId: string | null
  rollupName: string
  rollupAmount: number
  currency: string
  period: InsightsPeriod
  filters: InsightsFilters
  availableTags: Tag[]
  availableCategories: CategoryOption[]
}

export function CategoryDetailDialog({
  open,
  onOpenChange,
  rollupCategoryId,
  rollupName,
  rollupAmount,
  currency,
  period,
  filters,
  availableTags,
  availableCategories,
}: CategoryDetailDialogProps) {
  const router = useRouter()
  const [transactions, setTransactions] = React.useState<Transaction[] | null>(null)

  // Keep latest props in a ref so the fetch callback can read fresh values
  // without changing identity. Critical: the parent re-renders on every
  // server-action revalidation (since CategoryPicker etc. invalidate /insights)
  // which re-creates the `filters` object literal. If fetchTransactions
  // depended on those props, the effect would re-fire on every mutation
  // and blank out the table — exactly what we don't want.
  const argsRef = React.useRef({ rollupCategoryId, period, filters })
  argsRef.current = { rollupCategoryId, period, filters }

  // Two flavours: a noisy fetch (clears the table → shows spinner) for the
  // initial open, and a silent fetch that swaps the data in place after a
  // row-level edit. Row-level loading is the table's own concern (optimistic
  // states on the picker / travel toggle / exclusion toggle); the modal
  // shouldn't blank everything out for one mutation.
  const fetchTransactions = React.useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setTransactions(null)
    const { rollupCategoryId: rid, period: p, filters: f } = argsRef.current
    const id = rid ?? '__uncategorized__'
    const result = await getTransactionsForCategoryRollup(id, p, f)
    setTransactions(result)
  }, [])

  // Trigger the initial (loud) fetch only when the modal transitions to open.
  // Reset state when it closes so reopening for a different category gets a
  // fresh spinner, not stale data.
  const lastOpen = React.useRef(false)
  React.useEffect(() => {
    if (open && !lastOpen.current) {
      lastOpen.current = true
      fetchTransactions()
    } else if (!open && lastOpen.current) {
      lastOpen.current = false
      setTransactions(null)
    }
  }, [open, fetchTransactions])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize">{rollupName}</DialogTitle>
          <DialogDescription>
            {formatCurrency(rollupAmount, currency)}
            {transactions && ` · ${transactions.length} ${transactions.length === 1 ? 'transaction' : 'transactions'}`}
          </DialogDescription>
        </DialogHeader>

        {transactions === null ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TransactionTable
            transactions={transactions}
            availableTags={availableTags}
            availableCategories={availableCategories}
            showSource={true}
            enableTagging={true}
            enableCategory={true}
            emptyMessage="No transactions in this category for the selected period."
            onTransactionUpdate={() => {
              // Silent refetch — the table handles per-row loading itself,
              // so blanking the modal for one mutation is just visual noise.
              fetchTransactions({ silent: true })
              router.refresh()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
