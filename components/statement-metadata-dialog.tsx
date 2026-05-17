'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { updateStatementMetadata, type StatementMetadataPatch } from '@/app/actions/statements'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type ExpectedTotalKind = 'cc_new_charges_signed' | 'bank_withdrawals_abs' | null

interface StatementMetadataDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    statementId: string
    initial: {
        bank: string | null
        periodStart: string
        periodEnd: string
        currency: string
        expectedTotal: number | null
        expectedTotalKind: ExpectedTotalKind
        previousBalance: number | null
    }
}

function expectedTotalLabel(kind: ExpectedTotalKind): string {
    if (kind === 'cc_new_charges_signed') return 'New charges this cycle'
    if (kind === 'bank_withdrawals_abs') return 'Total withdrawals'
    return 'Expected total'
}

export function StatementMetadataDialog({
    open,
    onOpenChange,
    statementId,
    initial,
}: StatementMetadataDialogProps) {
    const router = useRouter()
    const [bank, setBank] = React.useState(initial.bank ?? '')
    const [periodStart, setPeriodStart] = React.useState(initial.periodStart)
    const [periodEnd, setPeriodEnd] = React.useState(initial.periodEnd)
    const [currency, setCurrency] = React.useState(initial.currency)
    const [expectedTotal, setExpectedTotal] = React.useState(
        initial.expectedTotal !== null ? String(initial.expectedTotal) : '',
    )
    const [previousBalance, setPreviousBalance] = React.useState(
        initial.previousBalance !== null ? String(initial.previousBalance) : '',
    )
    const [saving, setSaving] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (!open) return
        setBank(initial.bank ?? '')
        setPeriodStart(initial.periodStart)
        setPeriodEnd(initial.periodEnd)
        setCurrency(initial.currency)
        setExpectedTotal(initial.expectedTotal !== null ? String(initial.expectedTotal) : '')
        setPreviousBalance(initial.previousBalance !== null ? String(initial.previousBalance) : '')
        setError(null)
    }, [open, initial])

    const periodChanged =
        periodStart !== initial.periodStart || periodEnd !== initial.periodEnd

    const handleSave = async () => {
        setError(null)
        const patch: StatementMetadataPatch = {}

        const bankTrimmed = bank.trim()
        const initialBank = (initial.bank ?? '').trim()
        if (bankTrimmed !== initialBank) {
            patch.bank = bankTrimmed.length > 0 ? bankTrimmed : null
        }
        if (periodStart !== initial.periodStart) patch.periodStart = periodStart
        if (periodEnd !== initial.periodEnd) patch.periodEnd = periodEnd
        if (currency.trim().toUpperCase() !== initial.currency.toUpperCase()) {
            patch.currency = currency
        }

        const parseOptional = (raw: string): number | null | 'invalid' => {
            const t = raw.trim()
            if (t === '') return null
            const n = Number(t)
            return Number.isFinite(n) ? n : 'invalid'
        }

        const expectedNext = parseOptional(expectedTotal)
        if (expectedNext === 'invalid') {
            setError('Expected total must be a number.')
            return
        }
        if (expectedNext !== initial.expectedTotal) patch.expectedTotal = expectedNext

        const prevBalNext = parseOptional(previousBalance)
        if (prevBalNext === 'invalid') {
            setError('Previous balance must be a number.')
            return
        }
        if (prevBalNext !== initial.previousBalance) patch.previousBalance = prevBalNext

        if (Object.keys(patch).length === 0) {
            onOpenChange(false)
            return
        }

        setSaving(true)
        try {
            const result = await updateStatementMetadata(statementId, patch)
            if (!result.success) {
                setError(result.error)
                return
            }
            router.refresh()
            onOpenChange(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>Edit statement details</DialogTitle>
                    <DialogDescription>
                        Correct values the parser misread. Period changes do not
                        re-resolve transaction dates.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="metadata-bank">Bank</Label>
                        <Input
                            id="metadata-bank"
                            value={bank}
                            onChange={e => setBank(e.target.value)}
                            placeholder="dbs_posb"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="metadata-period-start">Period start</Label>
                            <Input
                                id="metadata-period-start"
                                type="date"
                                value={periodStart}
                                onChange={e => setPeriodStart(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="metadata-period-end">Period end</Label>
                            <Input
                                id="metadata-period-end"
                                type="date"
                                value={periodEnd}
                                onChange={e => setPeriodEnd(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="metadata-currency">Currency</Label>
                            <Input
                                id="metadata-currency"
                                value={currency}
                                onChange={e => setCurrency(e.target.value.toUpperCase())}
                                maxLength={3}
                                placeholder="SGD"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="metadata-prev-balance">Previous balance</Label>
                            <Input
                                id="metadata-prev-balance"
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={previousBalance}
                                onChange={e => setPreviousBalance(e.target.value)}
                                placeholder="—"
                            />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="metadata-expected-total">
                            {expectedTotalLabel(initial.expectedTotalKind)}
                        </Label>
                        <Input
                            id="metadata-expected-total"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            value={expectedTotal}
                            onChange={e => setExpectedTotal(e.target.value)}
                            placeholder="—"
                        />
                    </div>

                    {periodChanged && (
                        <p className="text-xs text-muted-foreground">
                            Note: period changes do not re-resolve transaction dates.
                            Re-upload if individual transaction dates are wrong.
                        </p>
                    )}
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
