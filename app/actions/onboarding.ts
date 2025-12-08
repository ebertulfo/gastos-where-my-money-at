'use server'

import { createClient } from '@/lib/supabase/server'
import { createTag } from './tags'
import { updateSettings } from './settings'

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
    await updateSettings({ currency: input.currency })

    // 2. Create Tags (if requested)
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
    
    return { success: true }
}
