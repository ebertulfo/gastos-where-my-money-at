'use client'

import { Check, ChevronsUpDown, Plus, Trash2, X } from "lucide-react"
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
import { Tag } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

interface TagInputProps {
    selectedTags: { id: string; name: string; color: string | null }[]
    availableTags: Tag[] // Flat list, we might want to organize this hierarchically later
    onTagsChange: (tags: string[]) => void
    onCreateTag?: (name: string) => Promise<Tag | null>
    onTagDelete?: () => void
    isLoading?: boolean
    disabled?: boolean
}

// Helper to find a tag by ID from the available list
function findTag(id: string, tags: Tag[]) {
    return tags.find(t => t.id === id)
}

export function TagInput({ selectedTags, availableTags, onTagsChange, onTagDelete, isLoading, disabled }: TagInputProps) {
    const [open, setOpen] = React.useState(false)
    const [inputValue, setInputValue] = React.useState("")
    const [isCreating, setIsCreating] = React.useState(false)

    // Derived state for selected IDs
    const selectedIds = React.useMemo(() => selectedTags.map(t => t.id), [selectedTags])

    const handleSelect = (tagId: string) => {
        if (selectedIds.includes(tagId)) {
            onTagsChange(selectedIds.filter(id => id !== tagId))
        } else {
            onTagsChange([...selectedIds, tagId])
        }
        setOpen(false) 
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

    const handleCreateTag = async () => {
        if (!inputValue.trim()) return
        setIsCreating(true)
        try {
            const newTag = await createTag({ name: inputValue.trim() })
            if (newTag) {
                onTagsChange([...selectedIds, newTag.id])
                setInputValue("")
                setOpen(false) 
                
                // Add to availableTags? 
                // We can't mutate props directly, but we can assume parent will refetch 
                // or we can pass a callback to "addAvailableTag" if we want instant availability for others.
                // For now, let's just ensure we clear UI state.
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
            <PopoverContent className="w-[300px] p-0" align="start">
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
                                    <Button
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => handleDeleteTag(e, tag.id, tag.name)}
                                    >
                                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                    </Button>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
