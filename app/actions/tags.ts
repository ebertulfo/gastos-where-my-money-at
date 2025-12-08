'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Tag } from '@/lib/supabase/database.types'

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

    const { data, error } = await supabase
        .from('tags')
        .insert({
            name: input.name,
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

    revalidatePath('/transactions')
    return data as Tag
}

export async function updateTag(id: string, input: Partial<CreateTagInput>) {
    const supabase = await createClient()
    
    const updates: any = {}
    if (input.name !== undefined) updates.name = input.name
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

    revalidatePath('/transactions')
    return data as Tag
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

    revalidatePath('/transactions')
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
        revalidatePath('/transactions')
        return
    }

    const { error: insertError } = await supabase
        .from('transaction_tags')
        .insert(
            tagIds.map((tagId) => ({
                transaction_id: transactionId,
                tag_id: tagId,
            })) as any
        )

    if (insertError) {
        throw new Error(insertError.message)
    }

    revalidatePath('/transactions')
}
