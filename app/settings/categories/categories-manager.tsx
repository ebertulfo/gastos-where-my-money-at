'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, RotateCcw, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  createCategory,
  deleteCategory,
  renameCategory,
  restoreDefaultCategories,
  updateCategory,
  type CategoryRow,
} from '@/app/actions/categories'

interface Props {
  initialCategories: CategoryRow[]
}

export function CategoriesManager({ initialCategories }: Props) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState<CategoryRow | null>(null)
  const [adding, setAdding] = React.useState<{ parentId: string | null } | null>(null)

  const refresh = () => router.refresh()

  const handleRestore = async () => {
    setBusy(true)
    try {
      await restoreDefaultCategories()
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const tree = React.useMemo(() => {
    const tops = initialCategories.filter(c => !c.parent_id)
    const childrenByParent = new Map<string, CategoryRow[]>()
    for (const c of initialCategories) {
      if (!c.parent_id) continue
      if (!childrenByParent.has(c.parent_id)) childrenByParent.set(c.parent_id, [])
      childrenByParent.get(c.parent_id)!.push(c)
    }
    return tops.map(t => ({ top: t, children: (childrenByParent.get(t.id) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)) }))
                .sort((a, b) => a.top.name.localeCompare(b.top.name))
  }, [initialCategories])

  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-2">
        <Button size="sm" variant="default" onClick={() => setAdding({ parentId: null })}>
          <Plus className="mr-1 h-4 w-4" /> Add top-level
        </Button>
        <Button size="sm" variant="outline" onClick={handleRestore} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}
          Restore defaults
        </Button>
      </div>

      {tree.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No categories yet. Click "Restore defaults" or add your own.
        </Card>
      ) : (
        <div className="space-y-2">
          {tree.map(({ top, children }) => (
            <Card key={top.id} className="p-3">
              <CategoryRowView
                row={top}
                onEdit={() => setEditing(top)}
                onAddChild={() => setAdding({ parentId: top.id })}
              />
              {children.length > 0 && (
                <div className="ml-6 mt-2 space-y-1 border-l border-muted pl-3">
                  {children.map(child => (
                    <CategoryRowView
                      key={child.id}
                      row={child}
                      onEdit={() => setEditing(child)}
                    />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <EditCategoryDialog
          row={editing}
          allCategories={initialCategories}
          onClose={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
      {adding && (
        <AddCategoryDialog
          parentId={adding.parentId}
          onClose={() => {
            setAdding(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function CategoryRowView({
  row,
  onEdit,
  onAddChild,
}: {
  row: CategoryRow
  onEdit: () => void
  onAddChild?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{row.name}</div>
        {row.description && (
          <div className="truncate text-xs text-muted-foreground">{row.description}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onAddChild && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onAddChild} title="Add subcategory">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function AddCategoryDialog({
  parentId,
  onClose,
}: {
  parentId: string | null
  onClose: () => void
}) {
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createCategory({
        name: name.trim(),
        parentId,
        description: description.trim() || null,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{parentId ? 'Add subcategory' : 'Add category'}</DialogTitle>
          <DialogDescription>Name is lowercase, hyphens allowed. Description seeds AI matching.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-medium">Name</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value.toLowerCase())}
              placeholder="e.g. groceries"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium">Description (optional)</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="comma-separated keywords / merchants the AI should match"
              rows={3}
            />
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditCategoryDialog({
  row,
  allCategories,
  onClose,
}: {
  row: CategoryRow
  allCategories: CategoryRow[]
  onClose: () => void
}) {
  const [name, setName] = React.useState(row.name)
  const [description, setDescription] = React.useState(row.description ?? '')
  const [parentId, setParentId] = React.useState<string | null>(row.parent_id)
  const [busy, setBusy] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Eligible parents: top-level categories that aren't this row.
  const parentOptions = allCategories.filter(c => !c.parent_id && c.id !== row.id)

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const trimmed = name.trim().toLowerCase()
      if (trimmed && trimmed !== row.name) {
        await renameCategory(row.id, trimmed)
      }
      const trimmedDesc = description.trim() || null
      const patch: { description?: string | null; parentId?: string | null } = {}
      if (trimmedDesc !== row.description) patch.description = trimmedDesc
      if (parentId !== row.parent_id) patch.parentId = parentId
      if (Object.keys(patch).length > 0) {
        await updateCategory(row.id, patch)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteCategory(row.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit category</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-medium">Name</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value.toLowerCase())}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium">Description</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <label className="text-xs font-medium">Parent</label>
            <Select
              value={parentId ?? '__none__'}
              onValueChange={v => setParentId(v === '__none__' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Top level —</SelectItem>
                {parentOptions.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>
        <DialogFooter className="flex justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </DialogFooter>

        {confirmingDelete && (
          <Dialog open onOpenChange={() => setConfirmingDelete(false)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete "{row.name}"?</DialogTitle>
                <DialogDescription>
                  Transactions in this category will be reassigned to the parent
                  ({row.parent_id ? 'parent category' : 'uncategorized'}). Sub-categories
                  will become top-level.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={busy}>Cancel</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={busy}>Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
