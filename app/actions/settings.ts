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

    if (!user) {
        console.log('getSettings: No user found')
        return null
    }

    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
        console.error('getSettings: Error fetching settings:', error)
        return null
    }

    if (!data) {
        console.log('getSettings: No settings found for user', user.id)
    } else {
        console.log('getSettings: Settings found', data)
    }

    return data as UserSettings | null
}

export async function updateSettings(input: { currency?: string }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Unauthorized')

    // Use Upsert for robustness
    const { error: upsertError } = await (supabase
        .from('user_settings' as any) as any)
        .upsert({
            user_id: user.id,
            currency: input.currency || 'SGD',
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })

    error = upsertError

    if (error) {
        console.error('Error updating settings:', error)
        throw new Error(error.message)
    }

    revalidatePath('/upload')
}
