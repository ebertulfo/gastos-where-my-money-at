'use server'

import { after } from 'next/server'
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { tags, transactions, transactionImports, userSettings } from '@/db/schema'
import { requireUserId } from '@/lib/auth'
import { embedTags, embedTransactions } from '@/lib/suggest/embed'
import { recategorizeUncategorizedTransactions } from '@/lib/suggest/auto-apply'
import { seedCategoriesForUser } from '@/lib/categories/seed'
import { tag as cacheTag } from '@/lib/cache/tags'

// Category mutations affect transactions, insights, and the review surface
// (since AI-applied categories also live there). Keep these in sync.
// Pass `userId` when the *category list itself* changed (create/rename/delete)
// so the cached getCategories() reads invalidate too.
function revalidateCategorySurfaces(userId?: string) {
  revalidatePath('/transactions')
  revalidatePath('/insights')
  revalidatePath('/summary')
  revalidatePath('/upload')
  revalidatePath('/settings/categories')
  revalidatePath('/imports/[statementId]/review', 'page')
  if (userId) revalidateTag(cacheTag.categories(userId), 'default')
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase()
}

export interface CategoryRow {
  id: string
  name: string
  description: string | null
  parent_id: string | null
  color: string | null
}

function toCategoryRow(t: {
  id: string
  name: string
  description: string | null
  parentId: string | null
  color: string | null
}): CategoryRow {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    parent_id: t.parentId,
    color: t.color,
  }
}

// ---------- Read ----------

export async function getCategories(): Promise<CategoryRow[]> {
  const userId = await requireUserId()
  return unstable_cache(
    async () => {
      const rows = await db
        .select({
          id: tags.id,
          name: tags.name,
          description: tags.description,
          parentId: tags.parentId,
          color: tags.color,
        })
        .from(tags)
        .where(and(eq(tags.userId, userId), eq(tags.kind, 'category')))
        .orderBy(asc(tags.name))
      return rows.map(toCategoryRow)
    },
    ['user-categories', userId],
    { tags: [cacheTag.categories(userId)], revalidate: 3600 },
  )()
}

// ---------- Per-transaction assignment ----------

export async function setTransactionCategory(
  transactionId: string,
  categoryId: string | null,
): Promise<void> {
  await requireUserId()
  await db
    .update(transactions)
    .set({
      categoryId,
      categorySource: categoryId ? 'user' : null,
    })
    .where(eq(transactions.id, transactionId))
  revalidateCategorySurfaces()
}

export async function confirmAiCategory(transactionId: string): Promise<void> {
  await requireUserId()
  await db
    .update(transactions)
    .set({ categorySource: 'user' })
    .where(and(eq(transactions.id, transactionId), eq(transactions.categorySource, 'ai')))
  revalidateCategorySurfaces()
}

export async function clearTransactionCategory(transactionId: string): Promise<void> {
  await requireUserId()
  await db
    .update(transactions)
    .set({ categoryId: null, categorySource: null })
    .where(eq(transactions.id, transactionId))
  revalidateCategorySurfaces()
}

export async function setImportCategory(importId: string, categoryId: string | null): Promise<void> {
  await requireUserId()
  await db
    .update(transactionImports)
    .set({
      categoryId,
      categorySource: categoryId ? 'user' : null,
    })
    .where(eq(transactionImports.id, importId))
  revalidateCategorySurfaces()
}

export async function confirmAiImportCategory(importId: string): Promise<void> {
  await requireUserId()
  await db
    .update(transactionImports)
    .set({ categorySource: 'user' })
    .where(and(eq(transactionImports.id, importId), eq(transactionImports.categorySource, 'ai')))
  revalidateCategorySurfaces()
}

export async function clearImportCategory(importId: string): Promise<void> {
  await requireUserId()
  await db
    .update(transactionImports)
    .set({ categoryId: null, categorySource: null })
    .where(eq(transactionImports.id, importId))
  revalidateCategorySurfaces()
}

// ---------- Taxonomy CRUD ----------

export interface CreateCategoryInput {
  name: string
  parentId?: string | null
  description?: string | null
  color?: string | null
}

export async function createCategory(input: CreateCategoryInput): Promise<CategoryRow> {
  const userId = await requireUserId()

  const name = normalizeCategoryName(input.name)
  if (!name) throw new Error('Category name is required')

  const [row] = await db
    .insert(tags)
    .values({
      userId,
      name,
      parentId: input.parentId ?? null,
      description: input.description ?? null,
      color: input.color ?? null,
      kind: 'category',
    })
    .returning({
      id: tags.id,
      name: tags.name,
      description: tags.description,
      parentId: tags.parentId,
      color: tags.color,
    })

  if (!row) throw new Error('Failed to create category')

  after(async () => {
    await embedTags([row.id])
  })

  revalidateCategorySurfaces(userId)
  return toCategoryRow(row)
}

export async function renameCategory(id: string, newName: string): Promise<CategoryRow> {
  const userId = await requireUserId()
  const name = normalizeCategoryName(newName)
  if (!name) throw new Error('Category name is required')

  const [row] = await db
    .update(tags)
    .set({ name })
    .where(and(eq(tags.id, id), eq(tags.kind, 'category')))
    .returning({
      id: tags.id,
      name: tags.name,
      description: tags.description,
      parentId: tags.parentId,
      color: tags.color,
    })

  if (!row) throw new Error('Category not found')

  after(async () => {
    await embedTags([id])
  })

  revalidateCategorySurfaces(userId)
  return toCategoryRow(row)
}

export async function updateCategory(
  id: string,
  patch: { description?: string | null; color?: string | null; parentId?: string | null },
): Promise<CategoryRow> {
  const userId = await requireUserId()
  const updates: Partial<{
    description: string | null
    color: string | null
    parentId: string | null
  }> = {}
  if (patch.description !== undefined) updates.description = patch.description
  if (patch.color !== undefined) updates.color = patch.color
  if (patch.parentId !== undefined) updates.parentId = patch.parentId

  const [row] = await db
    .update(tags)
    .set(updates)
    .where(and(eq(tags.id, id), eq(tags.kind, 'category')))
    .returning({
      id: tags.id,
      name: tags.name,
      description: tags.description,
      parentId: tags.parentId,
      color: tags.color,
    })

  if (!row) throw new Error('Category not found')

  if (patch.description !== undefined) {
    after(async () => {
      await embedTags([id])
    })
  }

  revalidateCategorySurfaces(userId)
  return toCategoryRow(row)
}

/**
 * Delete a category. Reassigns affected transactions to the parent (or to
 * NULL if top-level). Children of a deleted top-level get re-parented to
 * NULL — they become new top-levels.
 */
export async function deleteCategory(id: string): Promise<void> {
  const userId = await requireUserId()

  const [target] = await db
    .select({ parentId: tags.parentId })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.kind, 'category')))
    .limit(1)
  const newParent = target?.parentId ?? null

  await db
    .update(transactions)
    .set({ categoryId: newParent })
    .where(eq(transactions.categoryId, id))

  await db
    .update(transactionImports)
    .set({ categoryId: newParent })
    .where(eq(transactionImports.categoryId, id))

  await db
    .update(tags)
    .set({ parentId: null })
    .where(and(eq(tags.parentId, id), eq(tags.kind, 'category')))

  await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.kind, 'category')))

  revalidateCategorySurfaces(userId)
}

/**
 * Re-runs LLM categorization for any of the user's transactions still
 * uncategorized. Embeds anything missing an embedding first, then asks
 * `recategorizeUncategorizedTransactions` to fill in category_id.
 */
export async function recategorizeUncategorized(): Promise<{
  categorized: number
  attempted: number
  budgetExhausted: boolean
}> {
  const userId = await requireUserId()

  const missingEmbed = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.descriptionEmbedding),
        eq(transactions.status, 'active'),
      ),
    )
    .limit(2000)

  if (missingEmbed.length > 0) {
    await embedTransactions(missingEmbed.map(r => r.id))
  }

  const result = await recategorizeUncategorizedTransactions(userId)
  revalidateCategorySurfaces()
  return result
}

/**
 * Re-runs the country seed for the current user. Idempotent.
 */
export async function restoreDefaultCategories(): Promise<{ inserted: number; skipped: number }> {
  const userId = await requireUserId()

  const [settings] = await db
    .select({ country: userSettings.country })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  const country = settings?.country ?? 'default'

  const result = await seedCategoriesForUser(userId, country)
  revalidateCategorySurfaces(userId)
  return result
}
