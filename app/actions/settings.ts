'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { userSettings } from '@/db/schema'
import { requireUserId, getUserId } from '@/lib/auth'

export type UserSettings = {
    user_id: string
    currency: string
    country: string
    created_at: string
    updated_at: string
}

export async function getSettings() {
    const userId = await getUserId()
    if (!userId) return null

    const [row] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1)

    if (!row) return null

    return {
        user_id: row.userId,
        currency: row.currency,
        country: row.country,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
    } as UserSettings
}

export async function updateSettings(input: { currency?: string; country?: string }) {
    const userId = await requireUserId()

    const update: { currency?: string; country?: string; updatedAt: Date } = {
        updatedAt: new Date(),
    }
    if (input.currency !== undefined) update.currency = input.currency
    if (input.country !== undefined) update.country = input.country

    await db
        .insert(userSettings)
        .values({
            userId,
            currency: input.currency ?? 'SGD',
            country: input.country ?? 'SG',
        })
        .onConflictDoUpdate({
            target: userSettings.userId,
            set: update,
        })

    revalidatePath('/upload')
    revalidatePath('/insights')
    revalidatePath('/transactions')
}
