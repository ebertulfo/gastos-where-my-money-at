'use client'

import * as React from 'react'
import { Check, Loader2, Plane, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { applyTrip, detectTrips, type TripCandidate } from '@/app/actions/trips'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatCurrency, formatDate } from '@/lib/utils'

interface TripDetectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currency: string
}

export function TripDetectionDialog(props: TripDetectionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl">
        {props.open && <DialogBody {...props} />}
      </DialogContent>
    </Dialog>
  )
}

interface CandidateState {
  candidate: TripCandidate
  /** User-edited name; defaults to proposedName. */
  name: string
  applied: boolean
  applying: boolean
}

function DialogBody({ onOpenChange, currency }: TripDetectionDialogProps) {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [items, setItems] = React.useState<CandidateState[]>([])

  React.useEffect(() => {
    let cancelled = false
    detectTrips()
      .then(candidates => {
        if (cancelled) return
        setItems(candidates.map(c => ({ candidate: c, name: c.proposedName, applied: false, applying: false })))
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('detectTrips failed', err)
        toast.error('Failed to detect trips')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const updateName = (clusterId: string, name: string) => {
    setItems(prev =>
      prev.map(it => (it.candidate.clusterId === clusterId ? { ...it, name } : it)),
    )
  }

  const handleApply = async (clusterId: string) => {
    const item = items.find(it => it.candidate.clusterId === clusterId)
    if (!item) return
    if (!item.name.trim()) {
      toast.error('Trip needs a name')
      return
    }
    setItems(prev =>
      prev.map(it => (it.candidate.clusterId === clusterId ? { ...it, applying: true } : it)),
    )
    try {
      const { applied } = await applyTrip({
        name: item.name,
        transactionIds: item.candidate.transactionIds,
      })
      toast.success(`Tagged ${applied} rows as ${item.name}`)
      setItems(prev =>
        prev.map(it =>
          it.candidate.clusterId === clusterId ? { ...it, applied: true, applying: false } : it,
        ),
      )
      router.refresh()
    } catch (err) {
      console.error('applyTrip failed', err)
      toast.error('Failed to apply trip')
      setItems(prev =>
        prev.map(it =>
          it.candidate.clusterId === clusterId ? { ...it, applying: false } : it,
        ),
      )
    }
  }

  const remaining = items.filter(it => !it.applied).length
  const allDone = items.length > 0 && remaining === 0

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Plane className="h-4 w-4" />
          Detect trips
        </DialogTitle>
        <DialogDescription>
          Clusters of travel-flagged transactions grouped by date proximity. Names are AI-suggested — edit before applying.
        </DialogDescription>
      </DialogHeader>

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Looking for trips…
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <p>No untagged travel clusters found.</p>
          <p className="mt-1 text-xs">
            Mark rows as travel (✈ icon) to surface them here, or come back after your next trip.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="max-h-[480px] overflow-y-auto pr-1 space-y-3">
          {items.map(it => (
            <ClusterCard
              key={it.candidate.clusterId}
              state={it}
              currency={currency}
              onNameChange={(n) => updateName(it.candidate.clusterId, n)}
              onApply={() => handleApply(it.candidate.clusterId)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {allDone ? 'All trips applied.' : `${remaining} remaining`}
        </p>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          {allDone ? 'Done' : 'Close'}
        </Button>
      </div>
    </>
  )
}

interface ClusterCardProps {
  state: CandidateState
  currency: string
  onNameChange: (name: string) => void
  onApply: () => void
}

function ClusterCard({ state, currency, onNameChange, onApply }: ClusterCardProps) {
  const { candidate, name, applied, applying } = state
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-1 min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3 shrink-0 text-primary/70" />
            <Input
              value={name}
              onChange={e => onNameChange(e.target.value)}
              disabled={applied || applying}
              className="h-8 text-sm"
              placeholder="Trip name"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{formatDate(candidate.startDate)} – {formatDate(candidate.endDate)}</span>
            <span>·</span>
            <span>{candidate.rowCount} rows</span>
            <span>·</span>
            <span className="font-mono">{formatCurrency(candidate.totalAmount, currency)}</span>
            {candidate.currencies.length > 0 && (
              <>
                <span>·</span>
                <span>{candidate.currencies.join(', ')}</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {candidate.sampleMerchants.map((m, i) => (
              <Badge key={i} variant="outline" className="font-normal text-[10px]">
                {m}
              </Badge>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          onClick={onApply}
          disabled={applied || applying || !name.trim()}
        >
          {applying ? (
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          ) : applied ? (
            <Check className="h-3 w-3 mr-1.5" />
          ) : null}
          {applied ? 'Applied' : 'Apply'}
        </Button>
      </div>
    </div>
  )
}
