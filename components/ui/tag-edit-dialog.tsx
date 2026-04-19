'use client'

import { Loader2, Sparkles } from 'lucide-react'
import * as React from 'react'

import { generateTagDescription, setTagDescription } from '@/app/actions/tags'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface TagEditDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    tag: { id: string; name: string; description: string | null } | null
    onSaved?: () => void
}

export function TagEditDialog({ open, onOpenChange, tag, onSaved }: TagEditDialogProps) {
    const [description, setDescription] = React.useState('')
    const [saving, setSaving] = React.useState(false)
    const [regenerating, setRegenerating] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    // Reset local state every time a new tag is loaded into the dialog.
    React.useEffect(() => {
        if (open && tag) {
            setDescription(tag.description ?? '')
            setError(null)
        }
    }, [open, tag])

    if (!tag) return null

    const handleRegenerate = async () => {
        setRegenerating(true)
        setError(null)
        try {
            const updated = await generateTagDescription(tag.id)
            if (updated) {
                setDescription(updated.description ?? '')
                onSaved?.()
            } else {
                setError('AI is unavailable or over budget. Edit manually instead.')
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not regenerate.')
        } finally {
            setRegenerating(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            await setTagDescription(tag.id, description)
            onSaved?.()
            onOpenChange(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Edit tag: {tag.name}</DialogTitle>
                    <DialogDescription>
                        A description helps AI suggestions match this tag. Add merchants,
                        country codes, currencies, or keywords — anything that might show
                        up in a bank statement.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="tag-description">Description</Label>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={handleRegenerate}
                            disabled={regenerating || saving}
                        >
                            {regenerating ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                                <Sparkles className="h-3 w-3 mr-1" />
                            )}
                            Refresh AI
                        </Button>
                    </div>
                    <Textarea
                        id="tag-description"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="e.g. Japan travel. Tokyo, Osaka, Kyoto, ICOCA, JR Pass, Yen JPY."
                        rows={4}
                        disabled={saving || regenerating}
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={saving || regenerating}
                    >
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleSave} disabled={saving || regenerating}>
                        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
