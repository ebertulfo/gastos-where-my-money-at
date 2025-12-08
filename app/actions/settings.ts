'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type UserSettings = {
    user_id: string
    currency: string
    created_at: string
    updated_at: string
}

export async function getSettings() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
        console.error('Error fetching settings:', error)
        return null
    }

    return data as UserSettings | null
}

export async function updateSettings(input: { currency?: string }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Unauthorized')

    // Check if exists first
    const existing = await getSettings()

    let error
    if (existing) {
        const { error: updateError } = await (supabase
            .from('user_settings' as any) as any)
            .update({
                ...input,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
        error = updateError
    } else {
        const { error: insertError } = await (supabase
            .from('user_settings' as any) as any)
            .insert({
                user_id: user.id,
                currency: input.currency || 'SGD'
            })
        error = insertError
    }

    if (error) {
        console.error('Error updating settings:', error)
        throw new Error(error.message)
    }

    revalidatePath('/')
}
