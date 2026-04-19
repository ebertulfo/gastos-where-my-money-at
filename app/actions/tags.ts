'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'

import { Tag } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import { embedTags } from '@/lib/suggest/embed'
import { seedTagDescriptionViaLLM } from '@/lib/suggest/seed-tag-description'

// Tag changes ripple into the transactions list, the insights aggregations,
// the recent-imports / onboarding gate on /upload, and any statement detail
// page that renders tagged transactions.
function revalidateTagSurfaces() {
    revalidatePath('/transactions')
    revalidatePath('/insights')
    revalidatePath('/upload')
    revalidatePath('/statements/[id]', 'page')
}

// Tag names are stored lowercase so "Japan" vs "japan" can't diverge and
// the embedding space stays case-consistent with normalizeForEmbedding.
// Enforced in the DB via tags_name_lowercase_chk; we also normalize at the
// server-action boundary so users get a clean value back on insert without
// round-tripping a constraint error.
function normalizeTagName(name: string): string {
    return name.trim().toLowerCase()
}

export async function getTags() {
    const supabase = await createClient()
    const { data: tags, error } = await supabase
        .from('tags')
        .select('*')
        .order('name')

    if (error) {
        console.error('Error fetching tags:', error)
        return []
    }

    return tags as Tag[]
}

export type CreateTagInput = {
    name: string
    parentId?: string | null
    color?: string | null
}

export async function createTag(input: CreateTagInput) {
    const supabase = await createClient()
    const { data: user } = await supabase.auth.getUser()

    if (!user.user) {
        throw new Error('Unauthorized')
    }

    const name = normalizeTagName(input.name)

    const { data, error } = await supabase
        .from('tags')
        .insert({
            name,
            parent_id: input.parentId || null,
            color: input.color || null,
            user_id: user.user.id,
        } as any)
        .select()
        .single()

    if (error) {
        console.error('Error creating tag:', error)
        throw new Error(error.message)
    }

    const tag = data as Tag
    revalidateTagSurfaces()

    // Auto-seed description via LLM, then (re-)embed. Runs after the
    // response so tag creation stays snappy; the tag is immediately
    // usable with an embedding of just the name, and gets upgraded to
    // name+description within a second or two in the background.
    after(async () => {
        const seeded = await seedTagDescriptionViaLLM({
            userId: user.user!.id,
            tagName: name,
        })
        if (seeded) {
            await supabase
                .from('tags')
                .update({ description: seeded } as any)
                .eq('id', tag.id)
        }
        await embedTags(supabase, [tag.id])
        revalidateTagSurfaces()
    })

    return tag
}

export async function updateTag(id: string, input: Partial<CreateTagInput>) {
    const supabase = await createClient()

    const updates: any = {}
    if (input.name !== undefined) updates.name = normalizeTagName(input.name)
    if (input.parentId !== undefined) updates.parent_id = input.parentId
    if (input.color !== undefined) updates.color = input.color

    const { data, error } = await supabase
        .from('tags')
        .update(updates as unknown as never)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating tag:', error)
        throw new Error(error.message)
    }

    revalidateTagSurfaces()

    // Re-embed when the name changed (description unchanged here — use
    // setTagDescription / generateTagDescription for that). Background-fired
    // so the UI rerenders immediately.
    if (input.name !== undefined) {
        after(async () => {
            await embedTags(supabase, [id])
        })
    }

    return data as Tag
}

/**
 * Persists a user-edited description and re-embeds. Used when the user
 * types their own semantic cues into the tag-management UI.
 */
export async function setTagDescription(tagId: string, description: string | null) {
    const supabase = await createClient()

    const trimmed = description?.trim() || null

    const { data, error } = await supabase
        .from('tags')
        .update({ description: trimmed } as any)
        .eq('id', tagId)
        .select()
        .single()

    if (error) {
        console.error('Error updating tag description:', error)
        throw new Error(error.message)
    }

    revalidateTagSurfaces()

    after(async () => {
        await embedTags(supabase, [tagId])
    })

    return data as Tag
}

/**
 * "Refresh AI" — asks the LLM to regenerate the description based on the
 * current tag name, persists it, and re-embeds. Awaited end-to-end
 * because the user clicked a button and expects to see the new value.
 * Returns null if the call was over budget or the API key is missing.
 */
export async function generateTagDescription(tagId: string): Promise<Tag | null> {
    const supabase = await createClient()
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) throw new Error('Unauthorized')

    const { data: tagData, error: fetchError } = await supabase
        .from('tags')
        .select('id, name')
        .eq('id', tagId)
        .maybeSingle()

    if (fetchError || !tagData) {
        throw new Error('Tag not found')
    }

    const { name } = tagData as { name: string }

    const seeded = await seedTagDescriptionViaLLM({
        userId: user.user.id,
        tagName: name,
    })
    if (!seeded) return null

    const { data: updated, error: updateError } = await supabase
        .from('tags')
        .update({ description: seeded } as any)
        .eq('id', tagId)
        .select()
        .single()

    if (updateError) {
        throw new Error(updateError.message)
    }

    await embedTags(supabase, [tagId])
    revalidateTagSurfaces()

    return updated as Tag
}

export async function deleteTag(id: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting tag:', error)
        throw new Error(error.message)
    }

    revalidateTagSurfaces()
}

export async function assignTagsToTransaction(transactionId: string, tagIds: string[]) {
    const supabase = await createClient()

    // First delete existing tags for this transaction
    // Note: This is a simple strategy. For more complex scenarios we might want to diff.
    const { error: deleteError } = await supabase
        .from('transaction_tags')
        .delete()
        .eq('transaction_id', transactionId)

    if (deleteError) {
        throw new Error(deleteError.message)
    }

    if (tagIds.length === 0) {
        revalidateTagSurfaces()
        return
    }

    // Exactly one row per transaction must have is_primary=true (enforced by
    // idx_transaction_tags_one_primary). The first tag in the input becomes
    // primary; the rest are secondaries. The default for the column is true,
    // so we MUST set is_primary=false explicitly on the others.
    const { error: insertError } = await supabase
        .from('transaction_tags')
        .insert(
            tagIds.map((tagId, i) => ({
                transaction_id: transactionId,
                tag_id: tagId,
                is_primary: i === 0,
            })) as any
        )

    if (insertError) {
        throw new Error(insertError.message)
    }

    revalidateTagSurfaces()
}
