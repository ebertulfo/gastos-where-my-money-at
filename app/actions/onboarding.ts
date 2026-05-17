'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth'
import { ensureHouseholdMember } from './household-members'
import { updateSettings } from './settings'
import { seedCategoriesForUser } from '@/lib/categories/seed'

// Sensible starter members. The user can rename/delete/add more later via
// the upload selector or a future Settings page.
const DEFAULT_MEMBERS: ReadonlyArray<{ name: string; color: string }> = [
    { name: 'Me', color: '#10b981' },
    { name: 'Joint', color: '#6366f1' },
]

export type OnboardingInput = {
    currency: string
    country: string
}

export async function completeOnboarding(input: OnboardingInput) {
    const userId = await requireUserId()

    await updateSettings({ currency: input.currency, country: input.country })

    for (const m of DEFAULT_MEMBERS) {
        await ensureHouseholdMember({ name: m.name, color: m.color })
    }

    await seedCategoriesForUser(userId, input.country)

    revalidatePath('/', 'layout')
    revalidatePath('/upload')

    return { success: true }
}
