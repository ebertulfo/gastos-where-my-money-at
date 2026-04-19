'use client'

import { Check, ChevronsUpDown, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react"
import * as React from "react"

import { createTag, deleteTag } from "@/app/actions/tags"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { TagEditDialog } from "@/components/ui/tag-edit-dialog"
import { Tag } from "@/lib/supabase/database.types"
import type { TagSuggestion } from "@/lib/suggest/types"
import { cn } from "@/lib/utils"

interface TagInputProps {
    selectedTags: { id: string; name: string; color: string | null }[]
    availableTags: Tag[] // Flat list, we might want to organize this hierarchically later
    onTagsChange: (tags: string[]) => void
    onCreateTag?: (name: string) => Promise<Tag | null>
    onTagDelete?: () => void
    isLoading?: boolean
    disabled?: boolean
    /**
     * Called once per popover-open. Returns AI tag suggestions to render
     * as dashed pills above the search box. If omitted, the suggestion
     * row never renders.
     */
    getSuggestions?: () => Promise<TagSuggestion[]>
}

// Helper to find a tag by ID from the available list
function findTag(id: string, tags: Tag[]) {
    return tags.find(t => t.id === id)
}

export function TagInput({ selectedTags, availableTags, onTagsChange, onTagDelete, isLoading, disabled, getSuggestions }: TagInputProps) {
    const [open, setOpen] = React.useState(false)
    const [inputValue, setInputValue] = React.useState("")
    const [isCreating, setIsCreating] = React.useState(false)
    const [suggestions, setSuggestions] = React.useState<TagSuggestion[] | null>(null)
    const [isSuggesting, setIsSuggesting] = React.useState(false)
    const [editingTag, setEditingTag] = React.useState<Tag | null>(null)
    const suggestionsLoadedRef = React.useRef(false)

    // Derived state for selected IDs
    const selectedIds = React.useMemo(() => selectedTags.map(t => t.id), [selectedTags])

    // Fetch suggestions the first time the popover opens. Caches for the
    // life of the component (per-row); reopening doesn't re-fetch.
    React.useEffect(() => {
        if (!open || !getSuggestions || suggestionsLoadedRef.current) return
        suggestionsLoadedRef.current = true
        setIsSuggesting(true)
        getSuggestions()
            .then(s => setSuggestions(s))
            .catch(() => setSuggestions([]))
            .finally(() => setIsSuggesting(false))
    }, [open, getSuggestions])

    // Filter out suggestions for tags the user has already applied or
    // dismissed. Map IDs to Tag rows for rendering.
    const visibleSuggestions = React.useMemo(() => {
        if (!suggestions) return []
        const selected = new Set(selectedIds)
        return suggestions
            .filter(s => !selected.has(s.tagId))
            .map(s => ({ suggestion: s, tag: availableTags.find(t => t.id === s.tagId) }))
            .filter((x): x is { suggestion: TagSuggestion; tag: Tag } => Boolean(x.tag))
    }, [suggestions, selectedIds, availableTags])

    const handleAcceptSuggestion = (tagId: string) => {
        onTagsChange([...selectedIds, tagId])
        setSuggestions(prev => prev ? prev.filter(s => s.tagId !== tagId) : prev)
    }

    const handleDismissSuggestion = (tagId: string) => {
        setSuggestions(prev => prev ? prev.filter(s => s.tagId !== tagId) : prev)
    }

    const handleSelect = (tagId: string) => {
        if (selectedIds.includes(tagId)) {
            onTagsChange(selectedIds.filter(id => id !== tagId))
        } else {
            onTagsChange([...selectedIds, tagId])
        }
        // Keep the popover open so users can add multiple tags in one go;
        // click-outside still closes via Popover's onOpenChange.
        setInputValue("")
    }

    const handleUnselect = (e: React.MouseEvent, tagId: string) => {
        e.stopPropagation()
        onTagsChange(selectedIds.filter(id => id !== tagId))
    }

    const handleDeleteTag = async (e: React.MouseEvent, tagId: string, tagName: string) => {
        e.stopPropagation()
        if (!confirm(`Are you sure you want to delete the tag "${tagName}"?`)) return

        try {
            await deleteTag(tagId)

            if (onTagDelete) {
                onTagDelete()
            }
        } catch (error) {
            console.error("Failed to delete tag", error)
        }
    }

    const handleEditTag = (e: React.MouseEvent, tag: Tag) => {
        e.stopPropagation()
        // Close the popover so the dialog owns the focus stack.
        setOpen(false)
        setEditingTag(tag)
    }

    const handleCreateTag = async () => {
        if (!inputValue.trim()) return
        setIsCreating(true)
        try {
            const newTag = await createTag({ name: inputValue.trim() })
            if (newTag) {
                onTagsChange([...selectedIds, newTag.id])
                setInputValue("")
                // Keep popover open so users can add multiple tags / a fresh
                // creation followed by another existing tag in one flow.
            }
        } catch (error) {
            console.error("Failed to create tag", error)
        } finally {
            setIsCreating(false)
        }
    }

    // Filter available tags based on search
    const filteredTags = availableTags.filter(tag => 
        tag.name.toLowerCase().includes(inputValue.toLowerCase())
    )
    
    // Check if input value matches an existing tag exactly
    const exactMatch = filteredTags.some(tag => tag.name.toLowerCase() === inputValue.toLowerCase())

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-auto min-h-[2.5rem] py-2 px-3"
                    disabled={isLoading || disabled}
                >
                    <div className="flex flex-wrap gap-1 items-center">
                        {selectedTags.length > 0 ? (
                            selectedTags.map((tag) => (
                                <Badge variant="secondary" key={tag.id} className="mr-1 pr-1 flex items-center gap-1">
                                    {tag.name}
                                    <div 
                                        className="rounded-full hover:bg-muted p-0.5 cursor-pointer"
                                        onClick={(e) => handleUnselect(e, tag.id)}
                                    >
                                        <X className="h-3 w-3" />
                                    </div>
                                </Badge>
                            ))
                        ) : (
                            <span className="text-muted-foreground">Select tags...</span>
                        )}
                    </div>
                    {isLoading ? (
                        <div className="ml-2 h-4 w-4 shrink-0 animate-spin border-2 border-primary border-t-transparent rounded-full" />
                    ) : (
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
                {(isSuggesting || visibleSuggestions.length > 0) && (
                    <div className="border-b px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                            <Sparkles className="h-3 w-3" />
                            <span>{isSuggesting ? "Suggesting…" : "Suggested"}</span>
                            {isSuggesting && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                        </div>
                        {visibleSuggestions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {visibleSuggestions.map(({ suggestion, tag }) => (
                                    <div key={suggestion.tagId} className="flex items-center">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-2 text-xs border-dashed"
                                            style={tag.color ? { color: tag.color } : undefined}
                                            onClick={() => handleAcceptSuggestion(tag.id)}
                                        >
                                            <Check className="h-3 w-3 mr-1" />
                                            {tag.name}
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 text-muted-foreground"
                                            onClick={() => handleDismissSuggestion(tag.id)}
                                            aria-label={`Dismiss ${tag.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <Command>
                    <CommandInput
                        placeholder="Search tags..."
                        value={inputValue}
                        onValueChange={setInputValue}
                    />
                    <CommandList>
                        <CommandEmpty>
                             {!exactMatch && inputValue.trim().length > 0 && (
                                <div className="p-2">
                                     <Button 
                                        variant="ghost" 
                                        className="w-full justify-start text-sm"
                                        onClick={handleCreateTag}
                                        disabled={isCreating}
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create "{inputValue}"
                                    </Button>
                                </div>
                             )}
                             {inputValue.trim().length === 0 && "No tags found."}
                        </CommandEmpty>
                        <CommandGroup heading="Tags">
                            {filteredTags.map((tag) => (
                                <CommandItem
                                    key={tag.id}
                                    value={tag.name}
                                    onSelect={() => handleSelect(tag.id)}
                                    className="flex items-center justify-between group"
                                >
                                    <div className="flex items-center">
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedIds.includes(tag.id) ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {tag.name}
                                    </div>
                                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={(e) => handleEditTag(e, tag)}
                                            aria-label={`Edit ${tag.name}`}
                                        >
                                            <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={(e) => handleDeleteTag(e, tag.id, tag.name)}
                                            aria-label={`Delete ${tag.name}`}
                                        >
                                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                        </Button>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
            <TagEditDialog
                open={editingTag !== null}
                onOpenChange={(next) => {
                    if (!next) setEditingTag(null)
                }}
                tag={editingTag}
                onSaved={() => {
                    // Server action already revalidates the surfaces; the
                    // parent RSC page will refresh availableTags on next
                    // navigation. Nothing to do locally.
                }}
            />
        </Popover>
    )
}
