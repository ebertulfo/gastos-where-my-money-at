'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ensureHouseholdMember } from './household-members'
import { updateSettings } from './settings'
import { seedCategoriesForUser } from '@/lib/categories/seed'

// Sensible starter members. The user can rename/delete/add more later via
// the upload selector or a future Settings page. "Joint" stays as a member
// so it shows up alongside the rest in the same dropdown.
const DEFAULT_MEMBERS: ReadonlyArray<{ name: string; color: string }> = [
    { name: 'Me', color: '#10b981' },
    { name: 'Joint', color: '#6366f1' },
]

export type OnboardingInput = {
    currency: string
    country: string
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

    // 3. Seed country-aware category taxonomy. Idempotent. The seed function
    // also kicks off embedding so KNN/tag-embed have signal at first
    // statement upload.
    await seedCategoriesForUser(supabase, user.id, input.country)

    // Onboarding flips needsOnboarding → false on /upload and seeds members
    // and categories that the upload page reads. Invalidate both layers so
    // the wizard doesn't re-mount on next render and the new members appear
    // in the upload selector.
    revalidatePath('/', 'layout')
    revalidatePath('/upload')

    return { success: true }
}
