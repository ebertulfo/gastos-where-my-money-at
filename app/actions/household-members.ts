'use server'

import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { and, asc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { householdMembers, type HouseholdMember } from '@/db/schema'
import { requireUserId, getUserId } from '@/lib/auth'
import { tag } from '@/lib/cache/tags'

export type CreateHouseholdMemberInput = {
    name: string
    color?: string | null
}

const MEMBER_REVALIDATE_PATHS = ['/upload', '/transactions', '/insights', '/statements'] as const

function revalidateMemberSurfaces() {
    for (const path of MEMBER_REVALIDATE_PATHS) revalidatePath(path)
}

export async function getHouseholdMembers(): Promise<HouseholdMember[]> {
    const userId = await getUserId()
    if (!userId) return []
    return unstable_cache(
        async () => {
            return db
                .select()
                .from(householdMembers)
                .where(eq(householdMembers.userId, userId))
                .orderBy(asc(householdMembers.createdAt))
        },
        ['household-members', userId],
        { tags: [tag.members(userId)], revalidate: 3600 },
    )()
}

export async function createHouseholdMember(
    input: CreateHouseholdMemberInput,
): Promise<HouseholdMember> {
    const userId = await requireUserId()

    const name = input.name.trim()
    if (!name) throw new Error('Member name is required')

    try {
        const [row] = await db
            .insert(householdMembers)
            .values({
                userId,
                name,
                color: input.color ?? null,
            })
            .returning()

        if (!row) throw new Error('Failed to create household member')
        revalidateTag(tag.members(userId), 'default')
        revalidateMemberSurfaces()
        return row
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('duplicate key') || msg.includes('23505')) {
            throw new Error(`A member named "${name}" already exists`)
        }
        console.error('Error creating household member')
        throw new Error(msg)
    }
}

// Idempotent variant used during onboarding seeding. Returns the existing
// row when the name is already taken instead of throwing.
export async function ensureHouseholdMember(
    input: CreateHouseholdMemberInput,
): Promise<HouseholdMember | null> {
    try {
        return await createHouseholdMember(input)
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('already exists')) throw e

        const userId = await getUserId()
        if (!userId) return null

        const [existing] = await db
            .select()
            .from(householdMembers)
            .where(
                and(
                    eq(householdMembers.userId, userId),
                    sql`lower(${householdMembers.name}) = lower(${input.name.trim()})`,
                ),
            )
            .limit(1)

        return existing ?? null
    }
}
