import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { tags } from '@/db/schema'
import { embedTags } from '@/lib/suggest/embed'
import { getSeedForCountry, type SeedNode } from './seeds'

interface SeedResult {
  inserted: number
  skipped: number
}

/**
 * Inserts the country's seed taxonomy into `tags` for the given user.
 *
 * Idempotent: if the user already has any `kind='category'` rows, names that
 * already exist are skipped. Top-level rows are inserted first so children
 * can resolve `parent_id`.
 */
export async function seedCategoriesForUser(
  userId: string,
  country: string | null | undefined,
): Promise<SeedResult> {
  const seed = getSeedForCountry(country)

  const existing = await db
    .select({
      id: tags.id,
      name: tags.name,
      parentId: tags.parentId,
    })
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.kind, 'category')))

  const existingByName = new Map<string, { id: string; parentId: string | null }>(
    existing.map((r) => [r.name, { id: r.id, parentId: r.parentId }]),
  )

  let inserted = 0
  let skipped = 0
  const newlyInsertedIds: string[] = []
  const topLevelIdByName = new Map<string, string>()

  // Pass 1: top-level. Need their ids before we can insert children.
  for (const node of seed) {
    if (existingByName.has(node.name)) {
      topLevelIdByName.set(node.name, existingByName.get(node.name)!.id)
      skipped++
      continue
    }
    try {
      const [row] = await db
        .insert(tags)
        .values({
          userId,
          name: node.name,
          description: node.description,
          kind: 'category',
          parentId: null,
        })
        .returning({ id: tags.id })
      if (!row) continue
      topLevelIdByName.set(node.name, row.id)
      newlyInsertedIds.push(row.id)
      inserted++
    } catch {
      // Skip on conflict / constraint failure.
    }
  }

  // Pass 2: children.
  for (const node of seed) {
    if (!node.children || node.children.length === 0) continue
    const parentId = topLevelIdByName.get(node.name)
    if (!parentId) continue
    for (const child of node.children) {
      if (existingByName.has(child.name)) {
        skipped++
        continue
      }
      try {
        const [row] = await db
          .insert(tags)
          .values({
            userId,
            name: child.name,
            description: child.description,
            kind: 'category',
            parentId,
          })
          .returning({ id: tags.id })
        if (!row) continue
        newlyInsertedIds.push(row.id)
        inserted++
      } catch {
        // Skip on conflict.
      }
    }
  }

  if (newlyInsertedIds.length > 0) {
    await embedTags(newlyInsertedIds)
  }

  return { inserted, skipped }
}

export type { SeedNode }
