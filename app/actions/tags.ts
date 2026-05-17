'use server'

import { after } from 'next/server'
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { db } from '@/lib/db'
import { tags, transactionTags, type Tag } from '@/db/schema'
import { requireUserId } from '@/lib/auth'
import { tag as cacheTag } from '@/lib/cache/tags'
import { embedTags } from '@/lib/suggest/embed'
import { seedTagDescriptionViaLLM } from '@/lib/suggest/seed-tag-description'

// Tag changes ripple into the transactions list, the insights aggregations,
// the recent-imports / onboarding gate on /upload, and any statement detail
// page that renders tagged transactions.
function revalidateTagSurfaces(userId?: string) {
    revalidatePath('/transactions')
    revalidatePath('/insights')
    revalidatePath('/upload')
    revalidatePath('/statements/[id]', 'page')
    if (userId) revalidateTag(cacheTag.tags(userId), 'default')
}

// Tag names are stored lowercase (DB constraint tags_name_lowercase_chk);
// normalize at the action boundary so users get a clean value back without
// round-tripping a constraint error.
function normalizeTagName(name: string): string {
    return name.trim().toLowerCase()
}

export async function getTags(): Promise<Tag[]> {
    const userId = await requireUserId()
    return unstable_cache(
        async () => {
            return db
                .select()
                .from(tags)
                .where(and(eq(tags.userId, userId), eq(tags.kind, 'label')))
                .orderBy(asc(tags.name))
        },
        ['user-tags', userId],
        { tags: [cacheTag.tags(userId)], revalidate: 3600 },
    )()
}

export type CreateTagInput = {
    name: string
    parentId?: string | null
    color?: string | null
}

export async function createTag(input: CreateTagInput): Promise<Tag> {
    const userId = await requireUserId()
    const name = normalizeTagName(input.name)

    const [tag] = await db
        .insert(tags)
        .values({
            userId,
            name,
            parentId: input.parentId ?? null,
            color: input.color ?? null,
            kind: 'label',
        })
        .returning()

    if (!tag) throw new Error('Failed to create tag')

    revalidateTagSurfaces(userId)

    // Auto-seed description via LLM, then (re-)embed. Runs after the response
    // so tag creation stays snappy.
    after(async () => {
        const seeded = await seedTagDescriptionViaLLM({ userId, tagName: name })
        if (seeded) {
            await db
                .update(tags)
                .set({ description: seeded })
                .where(eq(tags.id, tag.id))
        }
        await embedTags([tag.id])
        revalidateTagSurfaces(userId)
    })

    return tag
}

export async function updateTag(id: string, input: Partial<CreateTagInput>): Promise<Tag> {
    const userId = await requireUserId()

    const updates: Partial<{ name: string; parentId: string | null; color: string | null }> = {}
    if (input.name !== undefined) updates.name = normalizeTagName(input.name)
    if (input.parentId !== undefined) updates.parentId = input.parentId
    if (input.color !== undefined) updates.color = input.color

    const [updated] = await db
        .update(tags)
        .set(updates)
        .where(eq(tags.id, id))
        .returning()

    if (!updated) throw new Error('Tag not found')

    revalidateTagSurfaces(userId)

    if (input.name !== undefined) {
        after(async () => {
            await embedTags([id])
        })
    }

    return updated
}

/**
 * Persists a user-edited description and re-embeds.
 */
export async function setTagDescription(tagId: string, description: string | null): Promise<Tag> {
    const userId = await requireUserId()

    const trimmed = description?.trim() || null

    const [updated] = await db
        .update(tags)
        .set({ description: trimmed })
        .where(eq(tags.id, tagId))
        .returning()

    if (!updated) throw new Error('Tag not found')

    revalidateTagSurfaces(userId)

    after(async () => {
        await embedTags([tagId])
    })

    return updated
}

/**
 * "Refresh AI" — asks the LLM to regenerate the description and re-embeds.
 * Returns null if the call was over budget or the API key is missing.
 */
export async function generateTagDescription(tagId: string): Promise<Tag | null> {
    const userId = await requireUserId()

    const [tagData] = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(eq(tags.id, tagId))
        .limit(1)

    if (!tagData) throw new Error('Tag not found')

    const seeded = await seedTagDescriptionViaLLM({ userId, tagName: tagData.name })
    if (!seeded) return null

    const [updated] = await db
        .update(tags)
        .set({ description: seeded })
        .where(eq(tags.id, tagId))
        .returning()

    if (!updated) throw new Error('Tag update failed')

    await embedTags([tagId])
    revalidateTagSurfaces(userId)

    return updated
}

export async function deleteTag(id: string): Promise<void> {
    const userId = await requireUserId()
    await db.delete(tags).where(eq(tags.id, id))
    revalidateTagSurfaces(userId)
}

export async function assignTagsToTransaction(
    transactionId: string,
    tagIds: string[],
): Promise<void> {
    await requireUserId()

    await db
        .delete(transactionTags)
        .where(eq(transactionTags.transactionId, transactionId))

    if (tagIds.length === 0) {
        revalidateTagSurfaces()
        return
    }

    // Exactly one row per transaction has is_primary=true (enforced by
    // idx_transaction_tags_one_primary). First tag in the input becomes
    // primary; the rest are explicitly false.
    await db.insert(transactionTags).values(
        tagIds.map((tagId, i) => ({
            transactionId,
            tagId,
            isPrimary: i === 0,
        })),
    )

    revalidateTagSurfaces()
}
