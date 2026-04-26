'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Sparkles, X } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

export interface CategoryOption {
  id: string
  name: string
  parent_id: string | null
}

interface CategoryPickerProps {
  /** Current category id, or null for uncategorized. */
  selectedId: string | null
  /** 'ai' = auto-applied (renders sparkle + ✓/✕). 'user' or null = solid pill / "Uncategorized". */
  source: 'user' | 'ai' | null
  /** Flat list of all `kind='category'` rows for the user. Hierarchy reconstructed from parent_id. */
  categories: CategoryOption[]
  onChange: (categoryId: string | null) => Promise<void>
  /** Confirm an AI category — flips source to 'user' without changing id. */
  onConfirmAi?: () => Promise<void>
  disabled?: boolean
}

interface RenderedCategory {
  id: string
  /** Display string: "groceries" for top-level, "food / groceries" for sub. */
  label: string
  /** Just "groceries". */
  shortLabel: string
}

function buildOptions(categories: CategoryOption[]): RenderedCategory[] {
  const byId = new Map(categories.map(c => [c.id, c]))
  const out: RenderedCategory[] = []
  for (const c of categories) {
    if (c.parent_id) {
      const parent = byId.get(c.parent_id)
      out.push({
        id: c.id,
        label: parent ? `${parent.name} / ${c.name}` : c.name,
        shortLabel: c.name,
      })
    } else {
      out.push({ id: c.id, label: c.name, shortLabel: c.name })
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

export function CategoryPicker({
  selectedId,
  source,
  categories,
  onChange,
  onConfirmAi,
  disabled,
}: CategoryPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const options = React.useMemo(() => buildOptions(categories), [categories])
  const selected = options.find(o => o.id === selectedId) ?? null

  const handlePick = async (id: string | null) => {
    setBusy(true)
    try {
      await onChange(id)
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onConfirmAi) return
    setBusy(true)
    try {
      await onConfirmAi()
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setBusy(true)
    try {
      await onChange(null)
    } finally {
      setBusy(false)
    }
  }

  const isAi = source === 'ai' && selectedId !== null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          size="sm"
          disabled={disabled || busy}
          className={cn(
            'h-8 w-full justify-between gap-1 px-2 text-xs font-normal',
            isAi && 'border-dashed bg-muted/40 italic',
            !selectedId && 'text-muted-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-1">
            {isAi && <Sparkles className="h-3 w-3 shrink-0 text-primary/70" aria-label="Auto-applied" />}
            <span className="truncate">{selected ? selected.label : 'Uncategorized'}</span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            {isAi && onConfirmAi && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Confirm AI category"
                onClick={handleConfirm}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') handleConfirm(e as unknown as React.MouseEvent)
                }}
                className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-primary/15 hover:text-primary"
              >
                <Check className="h-3 w-3" />
              </span>
            )}
            {selectedId && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear category"
                onClick={handleClear}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') handleClear(e as unknown as React.MouseEvent)
                }}
                className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-destructive/15 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories…" />
          <CommandList>
            <CommandEmpty>
              <div className="space-y-2 py-3 text-center text-sm">
                <div className="text-muted-foreground">No matches.</div>
                <Link
                  href="/settings/categories"
                  className="text-xs underline underline-offset-2 hover:text-primary"
                >
                  Manage categories →
                </Link>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt.id}
                  value={opt.label}
                  onSelect={() => handlePick(opt.id)}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedId === opt.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup>
              <CommandItem
                value="__manage__"
                onSelect={() => {
                  setOpen(false)
                  if (typeof window !== 'undefined') window.location.href = '/settings/categories'
                }}
                className="text-xs text-muted-foreground"
              >
                Manage categories…
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
