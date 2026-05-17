'use client'

import { confirmStatementImport, deleteStatement, getPendingStatements, saveDuplicateDecision } from '@/app/actions/statements'
import { setImportCategory, confirmAiImportCategory } from '@/app/actions/categories'
import { ReviewTabs } from '@/app/imports/[statementId]/review/review-tabs'
import { TransactionTable } from '@/components/transaction-table'
import type { CategoryOption } from '@/components/category-picker'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { StatementMetadataDialog } from '@/components/statement-metadata-dialog'
import type { Tag } from '@/db/schema'
import type { ImportReview, Statement as UIStatement, StatementReconciliation } from '@/lib/types/transaction'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, Check, CheckCircle2, Info, Loader2, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type DuplicateDecisions = Record<string, 'keep_existing' | 'add_new'>

interface ReviewViewProps {
  statementId: string
  review: ImportReview
  availableTags: Tag[]
  availableCategories: CategoryOption[]
  pendingStatements: UIStatement[]
}

export function ReviewView({ statementId, review, availableTags, availableCategories, pendingStatements }: ReviewViewProps) {
  const router = useRouter()
  const { statement, newTransactions, duplicates, reconciliation } = review

  const [duplicateDecisions, setDuplicateDecisions] = useState<DuplicateDecisions>(
    () => Object.fromEntries(duplicates.map(d => [d.importId, 'keep_existing' as const]))
  )
  const [isConfirming, setIsConfirming] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [isEditingMetadata, setIsEditingMetadata] = useState(false)

  const setDuplicateDecision = async (importId: string, decision: 'keep_existing' | 'add_new') => {
    setDuplicateDecisions(prev => ({ ...prev, [importId]: decision }))
    try {
      await saveDuplicateDecision(importId, decision === 'add_new' ? 'accept' : 'reject')
    } catch (err) {
      console.error('Failed to save decision', err)
    }
  }

  const handleConfirm = async () => {
    setIsConfirming(true)
    try {
      const decisions = [
        ...newTransactions.map(t => ({ importId: t.id, action: 'accept' as const })),
        ...duplicates.map(dup => ({
          importId: dup.importId,
          action: duplicateDecisions[dup.importId] === 'add_new' ? 'accept' as const : 'reject' as const,
        })),
      ]

      const result = await confirmStatementImport(statementId, decisions)
      if (!result.success) {
        console.error('Confirm failed:', result.error)
        return
      }

      // Next pending statement → continue review chain.
      try {
        const updatedPending = await getPendingStatements()
        const next = updatedPending.find(s => s.id !== statementId)
        if (next) {
          router.push(`/imports/${next.id}/review`)
          return
        }
      } catch {
        // Fall through.
      }

      const monthQuery = result.targetMonth ? `?month=${result.targetMonth}` : ''
      router.push(`/transactions${monthQuery}`)
    } finally {
      setIsConfirming(false)
    }
  }

  const handleReject = async () => {
    if (!window.confirm('Are you sure you want to delete this import? This action cannot be undone.')) return
    setIsRejecting(true)
    try {
      const result = await deleteStatement(statementId)
      if (result.success) {
        router.push('/')
      }
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <main className="container py-8">
      <div className="flex flex-col gap-6 mb-8">
        <ReviewTabs
          currentStatementId={statementId}
          pendingStatements={pendingStatements}
        />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Review Import: {statement.bankName}</h1>
            <p className="text-muted-foreground">
              {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">Return to Dashboard</Link>
          </Button>
        </div>
      </div>

      <ReconciliationBanner reconciliation={reconciliation} />

      <Card className="mb-8 animate-fade-in">
        <CardContent className="p-6">
          <div className="flex items-center justify-end mb-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEditingMetadata(true)}>
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Bank / Account</p>
              <p className="font-medium">
                {statement.bankName}
                {statement.accountLabel && ` (${statement.accountLabel})`}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Period</p>
              <p className="font-medium">
                {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Currency</p>
              <p className="font-medium">{statement.currency}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Found</p>
              <p className="font-medium">{statement.transactionCount} transactions</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {reconciliationLabel(reconciliation)}
              </p>
              <p className="font-medium">
                {reconciliation.expectedTotal !== null
                  ? formatCurrency(reconciliation.expectedTotal, reconciliation.currency)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Extracted total</p>
              <p
                className={cn(
                  'font-medium',
                  reconciliation.status === 'mismatch' && 'text-warning',
                )}
              >
                {reconciliation.extractedTotal !== null
                  ? formatCurrency(reconciliation.extractedTotal, reconciliation.currency)
                  : '—'}
                {reconciliation.status === 'mismatch' && reconciliation.diff !== null ? (
                  <span className="ml-2 text-xs">
                    ({reconciliation.diff > 0 ? '+' : ''}
                    {formatCurrency(reconciliation.diff, reconciliation.currency)})
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-success">
              <Check className="h-3 w-3 mr-1" />
              New: {newTransactions.length}
            </Badge>
            <ReconciliationBadge reconciliation={reconciliation} />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8 animate-slide-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-success" />
            New Transactions
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {newTransactions.length} new transactions will be added to your history.
          </p>
        </CardHeader>
        <CardContent>
          <TransactionTable
            transactions={newTransactions}
            availableTags={availableTags}
            availableCategories={availableCategories}
            showSource={false}
            emptyMessage="No new transactions found."
            enableTagging={false}
            enableCategory={true}
            onCategoryChangeOverride={async (importId, categoryId) => {
              await setImportCategory(importId, categoryId)
              router.refresh()
            }}
            onConfirmAiCategoryOverride={async (importId) => {
              await confirmAiImportCategory(importId)
              router.refresh()
            }}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between py-6 border-t">
        <Button
          variant="destructive"
          onClick={handleReject}
          disabled={isRejecting || isConfirming}
        >
          {isRejecting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Deleting...
            </>
          ) : (
            'Delete Import'
          )}
        </Button>
        <Button onClick={handleConfirm} disabled={isConfirming || isRejecting}>
          {isConfirming ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Finish Import
            </>
          )}
        </Button>
      </div>

      {/* Duplicate decisions are persisted via setDuplicateDecision when the
          duplicates section is reintroduced. Spec 6 hides duplicates today
          (silently skipped via ON CONFLICT DO NOTHING at commit), so the
          handler is wired but unused in render. */}
      {duplicates.length > 0 && false && (
        <button onClick={() => setDuplicateDecision(duplicates[0].importId, 'add_new')} />
      )}

      <StatementMetadataDialog
        open={isEditingMetadata}
        onOpenChange={setIsEditingMetadata}
        statementId={statementId}
        initial={{
          bank: statement.bankRaw,
          periodStart: statement.periodStart,
          periodEnd: statement.periodEnd,
          currency: statement.currency,
          expectedTotal: reconciliation.expectedTotal,
          expectedTotalKind: reconciliation.expectedTotalKind,
          previousBalance: statement.previousBalance,
        }}
      />
    </main>
  )
}

// Reserved for the only case where a full banner pulls its weight: the
// extracted sum disagrees with the statement total. Match and unavailable
// states are conveyed inline in the summary card via ReconciliationBadge,
// since a full alert for "everything's fine" is mostly visual noise.
function ReconciliationBanner({ reconciliation }: { reconciliation: StatementReconciliation }) {
  if (reconciliation.status !== 'mismatch') return null

  const expected = reconciliation.expectedTotal ?? 0
  const extracted = reconciliation.extractedTotal ?? 0
  const diff = reconciliation.diff ?? 0
  const currency = reconciliation.currency
  const kindLabel = reconciliationLabel(reconciliation)

  return (
    <Alert className="mb-6 border-warning/50 bg-warning/5 animate-fade-in">
      <AlertTriangle className="h-4 w-4 text-warning" />
      <AlertTitle className="text-sm">Extracted total doesn't match the statement</AlertTitle>
      <AlertDescription className="text-xs text-muted-foreground">
        {kindLabel}: {formatCurrency(expected, currency)} · Extracted{' '}
        {formatCurrency(extracted, currency)} ·{' '}
        <span className="font-medium text-foreground">
          Diff {diff > 0 ? '+' : ''}{formatCurrency(diff, currency)}
        </span>
        . Some rows may be missing or duplicated — please review carefully before confirming.
      </AlertDescription>
    </Alert>
  )
}

function ReconciliationBadge({ reconciliation }: { reconciliation: StatementReconciliation }) {
  if (reconciliation.status === 'match') {
    return (
      <Badge variant="outline" className="border-success/50 text-success">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Reconciled
      </Badge>
    )
  }
  if (reconciliation.status === 'mismatch') {
    return (
      <Badge variant="outline" className="border-warning/60 text-warning">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Mismatch
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
      <Info className="h-3 w-3 mr-1" />
      Total not detected
    </Badge>
  )
}

function reconciliationLabel(reconciliation: StatementReconciliation): string {
  if (reconciliation.expectedTotalKind === 'cc_new_charges_signed') return 'New charges this cycle'
  if (reconciliation.expectedTotalKind === 'bank_withdrawals_abs') return 'Total withdrawals'
  return 'Statement total'
}
