'use client'

import { createHouseholdMember } from '@/app/actions/household-members'
import { OnboardingWizard } from '@/components/onboarding-wizard'
import { StatementCard } from '@/components/statement-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Separator } from '@/components/ui/separator'
import { UploadDropzone } from '@/components/upload-dropzone'
import { UploadProgressList } from '@/components/upload-progress-list'
import { useStatementUpload } from '@/lib/hooks/use-statement-upload'
import type { HouseholdMember } from '@/db/schema'
import type { Statement } from '@/lib/types/transaction'
import { cn } from '@/lib/utils'
import { Check, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

const AI_DISCLOSURE_KEY = 'gastos.ai-disclosure-dismissed'
const LAST_MEMBER_IDS_KEY = 'gastos.last-member-ids'

interface UploadViewProps {
  initialRecentImports: Statement[]
  needsOnboarding: boolean
  initialMembers: HouseholdMember[]
}

export function UploadView({
  initialRecentImports,
  needsOnboarding,
  initialMembers,
}: UploadViewProps) {
  const router = useRouter()
  const { upload, uploads, isUploading } = useStatementUpload()
  const [showOnboarding, setShowOnboarding] = useState(needsOnboarding)
  const [showAIDisclosure, setShowAIDisclosure] = useState(false)
  const [members, setMembers] = useState<HouseholdMember[]>(initialMembers)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Add-member dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addSubmitting, setAddSubmitting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setShowAIDisclosure(window.localStorage.getItem(AI_DISCLOSURE_KEY) !== '1')

    // Restore last-used selection — only ids that still exist in the household.
    const raw = window.localStorage.getItem(LAST_MEMBER_IDS_KEY)
    if (raw) {
      try {
        const ids = JSON.parse(raw) as string[]
        const validIds = new Set(ids.filter((id) => initialMembers.some((m) => m.id === id)))
        setSelectedIds(validIds)
      } catch {
        // ignore malformed payload
      }
    }
  }, [initialMembers])

  const persistSelection = (next: Set<string>) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LAST_MEMBER_IDS_KEY, JSON.stringify(Array.from(next)))
    }
  }

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persistSelection(next)
      return next
    })
  }

  const clearMembers = () => {
    const empty = new Set<string>()
    setSelectedIds(empty)
    persistSelection(empty)
  }

  const handleAddMember = async () => {
    const name = newMemberName.trim()
    if (!name) {
      setAddError('Give the member a name')
      return
    }
    setAddSubmitting(true)
    setAddError(null)
    try {
      const created = await createHouseholdMember({ name })
      setMembers((prev) => [...prev, created])
      // Auto-select the newly added member.
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.add(created.id)
        persistSelection(next)
        return next
      })
      setNewMemberName('')
      setAddOpen(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not create member')
    } finally {
      setAddSubmitting(false)
    }
  }

  const dismissAIDisclosure = () => {
    setShowAIDisclosure(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AI_DISCLOSURE_KEY, '1')
    }
  }

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      await upload(files, Array.from(selectedIds))
    },
    [upload, selectedIds],
  )

  const showParsingProgress = isUploading || uploads.length > 0
  const selectedCount = selectedIds.size

  return (
    <>
      <OnboardingWizard
        open={showOnboarding}
        onFinish={() => {
          setShowOnboarding(false)
          router.refresh()
        }}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add a household member</DialogTitle>
            <DialogDescription>
              Names show up on the upload selector and let you split spending per person.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-member-name">Name</Label>
            <Input
              id="new-member-name"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="Edrian, Jen, Joint, Kid 1…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddMember()
              }}
            />
            {addError && <p className="text-sm text-destructive">{addError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setAddOpen(false)
                setNewMemberName('')
                setAddError(null)
              }}
              disabled={addSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={addSubmitting || !newMemberName.trim()}>
              {addSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <main className="container py-8 md:py-12">
        <div className="text-center mb-10 animate-fade-in">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Unfuck your finances.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload your bank statements and see where your household money really goes.
          </p>
        </div>

        <div className="max-w-2xl mx-auto mb-6">
          {showAIDisclosure && (
            <Alert className="mb-4 border-primary/30 bg-primary/5 flex items-start gap-3">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <AlertDescription className="flex-1 text-sm">
                When you tag transactions, AI suggests categories from your existing tags. Sanitised
                descriptions are sent to OpenAI for processing.
              </AlertDescription>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mt-1"
                onClick={dismissAIDisclosure}
                aria-label="Dismiss"
              >
                <X className="h-3 w-3" />
              </Button>
            </Alert>
          )}
        </div>

        <div className="max-w-2xl mx-auto mb-12">
          {!showParsingProgress && (
            <div className="mb-4 space-y-2 animate-slide-up">
              <div className="flex items-baseline justify-between">
                <Label className="text-sm font-medium">Whose statements are these?</Label>
                {selectedCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearMembers}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const selected = selectedIds.has(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMember(m.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        selected
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted',
                      )}
                      aria-pressed={selected}
                    >
                      {selected ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                      <span>{m.name}</span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add member</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedCount === 0
                  ? 'Pick one or more — leave empty to skip attribution.'
                  : selectedCount === 1
                    ? 'Tagged to 1 member. Pick another for joint / shared statements.'
                    : `Tagged to ${selectedCount} members. Applied to every file you drop next.`}
                {selectedCount > 0 ? (
                  <Badge variant="outline" className="ml-2">
                    {selectedCount} selected
                  </Badge>
                ) : null}
              </p>
            </div>
          )}

          {showParsingProgress ? (
            <UploadProgressList uploads={uploads} className="animate-slide-up" />
          ) : (
            <UploadDropzone
              onFileSelect={handleFileSelect}
              isUploading={isUploading}
              className="animate-slide-up"
            />
          )}
        </div>

        <Separator className="my-8" />

        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Imports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {initialRecentImports.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">
                  No statements imported yet. Upload your first one above.
                </p>
              ) : (
                initialRecentImports.map((stmt) => (
                  <StatementCard key={stmt.id} {...stmt} />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  )
}
