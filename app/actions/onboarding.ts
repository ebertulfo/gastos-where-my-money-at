'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createTag } from './tags'
import { ensureHouseholdMember } from './household-members'
import { updateSettings } from './settings'

// Sensible starter members. The user can rename/delete/add more later via
// the upload selector or a future Settings page. "Joint" stays as a member
// so it shows up alongside the rest in the same dropdown.
const DEFAULT_MEMBERS: ReadonlyArray<{ name: string; color: string }> = [
    { name: 'Me', color: '#10b981' },
    { name: 'Joint', color: '#6366f1' },
]

const DEFAULT_TAGS = [
    {
        name: 'Living',
        color: '#ef4444', // Red
        children: ['Rent', 'Utilities', 'Internet', 'Mobile', 'Maintenance']
    },
    {
        name: 'Food',
        color: '#f97316', // Orange
        children: ['Groceries', 'Dining Out', 'Coffee', 'Alcohol']
    },
    {
        name: 'Transport',
        color: '#eab308', // Yellow
        children: ['Public Transport', 'Taxi/Ride', 'Fuel', 'Parking', 'Car Maintenance']
    },
    {
        name: 'Shopping',
        color: '#3b82f6', // Blue
        children: ['Clothing', 'Electronics', 'Home', 'Personal Care']
    },
    {
        name: 'Entertainment',
        color: '#8b5cf6', // Violet
        children: ['Movies', 'Games', 'Subscriptions', 'Hobbies']
    },
    {
        name: 'Health',
        color: '#10b981', // Emerald
        children: ['Medical', 'Fitness', 'Insurance']
    },
    {
        name: 'Travel',
        color: '#06b6d4', // Cyan
        children: ['Flights', 'Hotels', 'Activities']
    },
    {
        name: 'Income',
        color: '#22c55e', // Green
        children: ['Salary', 'Freelance', 'Dividends', 'Gift']
    }
]

export type OnboardingInput = {
    currency: string
    country: string
    useDefaultTags: boolean
}

// Helper to create tag idempotently
async function safeCreateTag(name: string, color?: string | null, parentId?: string | null) {
    try {
        return await createTag({ name, color, parentId })
    } catch (e: any) {
        // Check for unique constraint violation (tag already exists)
        if (e.message?.includes('duplicate key') || e.message?.includes('unique constraint')) {
             const supabase = await createClient()
             // Find the existing tag
             let query = supabase.from('tags').select('*').eq('name', name)
             
             if (parentId) {
                 query = query.eq('parent_id', parentId)
             } else {
                 query = query.is('parent_id', null)
             }
             
             const { data } = await query.single()
             return data
        }
        // Rethrow other errors
        throw e
    }
}

export async function completeOnboarding(input: OnboardingInput) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) throw new Error('Unauthorized')

    // 1. Save Settings
    await updateSettings({ currency: input.currency, country: input.country })

    // 2. Seed default household members (idempotent — re-running onboarding
    // won't duplicate). User can rename/delete from upload page Add-member
    // flow or future settings page.
    for (const m of DEFAULT_MEMBERS) {
        await ensureHouseholdMember({ name: m.name, color: m.color })
    }

    // 3. Create Tags (if requested)
    if (input.useDefaultTags) {
        // We do this sequentially to ensure parents exist before children
        for (const category of DEFAULT_TAGS) {
            // Create Parent
            const parent = await safeCreateTag(category.name, category.color)

            if (parent) {
                // Create Children
                await Promise.all(category.children.map(childName => 
                    safeCreateTag(childName, null, parent.id)
                ))
            }
        }
    }

    // Onboarding flips needsOnboarding → false on /upload and seeds tags +
    // members that the upload page reads. Invalidate both layers so the
    // wizard doesn't re-mount on next render and the new members appear in
    // the upload selector.
    revalidatePath('/', 'layout')
    revalidatePath('/upload')

    return { success: true }
}
