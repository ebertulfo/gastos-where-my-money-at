'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Tag } from '@/lib/supabase/database.types'
import type { ImportSuggestion, Transaction } from '@/lib/types/transaction'
import { cn } from '@/lib/utils'
import { Check, Loader2, Sparkles, X } from 'lucide-react'

export interface AcceptedMap {
  // importId → set of tag ids the user accepted (or manually picked from suggestions)
  [importId: string]: string[]
}

export interface DismissedMap {
  // importId → set of tag ids the user dismissed
  [importId: string]: string[]
}

interface SuggestionsPanelProps {
  newTransactions: Transaction[]
  suggestions: ImportSuggestion[]
  availableTags: Tag[]
  accepted: AcceptedMap
  dismissed: DismissedMap
  onAccept: (importId: string, tagId: string) => void
  onDismiss: (importId: string, tagId: string) => void
}

export function SuggestionsPanel({
  newTransactions,
  suggestions,
  availableTags,
  accepted,
  dismissed,
  onAccept,
  onDismiss,
}: SuggestionsPanelProps) {
  const tagsById = new Map(availableTags.map(t => [t.id, t]))
  const txByImportId = new Map(newTransactions.map(t => [t.id, t]))

  const pendingCount = suggestions.filter(s => s.status === 'pending').length
  const completedCount = suggestions.filter(s => s.status === 'completed').length
  const failedCount = suggestions.filter(s => s.status === 'failed').length

  const rowsWithSuggestions = suggestions.filter(s => {
    if (s.status !== 'completed') return false
    if (s.suggestedTagIds.length === 0) return false
    const dismissedForRow = new Set(dismissed[s.importId] ?? [])
    const acceptedForRow = new Set(accepted[s.importId] ?? [])
    // Show only if there's at least one suggestion still undecided.
    return s.suggestedTagIds.some(id => !dismissedForRow.has(id) && !acceptedForRow.has(id))
  })

  // Nothing actionable and nothing pending → render a quiet "all done" state
  // so the user knows AI ran but had nothing to suggest.
  if (rowsWithSuggestions.length === 0 && pendingCount === 0) {
    if (completedCount === 0 && failedCount === 0) return null
    return (
      <Card className="mb-6 border-dashed">
        <CardContent className="p-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>
            AI tag suggestions {failedCount > 0 ? 'couldn’t be generated for some rows' : 'are ready'}.
            {' '}You can still tag manually after import.
          </span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI tag suggestions
          {pendingCount > 0 && (
            <Badge variant="secondary" className="ml-2 font-normal">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Suggesting {pendingCount}…
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Accept the suggestions you like; dismiss the ones you don’t. Anything you accept will be tagged on import.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rowsWithSuggestions.length === 0 && pendingCount > 0 && (
          <p className="text-sm text-muted-foreground italic">Waiting for AI suggestions…</p>
        )}
        {rowsWithSuggestions.map(s => {
          const tx = txByImportId.get(s.importId)
          if (!tx) return null
          const acceptedForRow = new Set(accepted[s.importId] ?? [])
          const dismissedForRow = new Set(dismissed[s.importId] ?? [])
          const undecidedTagIds = s.suggestedTagIds.filter(
            id => !acceptedForRow.has(id) && !dismissedForRow.has(id)
          )

          return (
            <div key={s.importId} className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.description}</p>
                <p className="text-xs text-muted-foreground">{tx.date}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 max-w-[60%] justify-end">
                {undecidedTagIds.map(tagId => {
                  const tag = tagsById.get(tagId)
                  if (!tag) return null
                  return (
                    <div key={tagId} className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          'h-7 px-2 text-xs border-dashed',
                          tag.color && 'border-current'
                        )}
                        style={tag.color ? { color: tag.color } : undefined}
                        onClick={() => onAccept(s.importId, tagId)}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        {tag.name}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground"
                        onClick={() => onDismiss(s.importId, tagId)}
                        aria-label={`Dismiss ${tag.name}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
