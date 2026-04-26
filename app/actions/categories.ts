'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { embedTags, embedTransactions } from '@/lib/suggest/embed'
import { seedCategoriesForUser } from '@/lib/categories/seed'
import { recategorizeUncategorizedTransactions } from '@/lib/suggest/auto-apply'

// Category mutations affect transactions, insights, and the review surface
// (since AI-applied categories also live there). Keep these in sync.
function revalidateCategorySurfaces() {
  revalidatePath('/transactions')
  revalidatePath('/insights')
  revalidatePath('/summary')
  revalidatePath('/upload')
  revalidatePath('/settings/categories')
  revalidatePath('/imports/[statementId]/review', 'page')
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

// ---------- Read ----------

export async function getCategories(): Promise<CategoryRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, description, parent_id, color')
    .eq('kind', 'category')
    .order('name')

  if (error) {
    console.error('Error fetching categories:', error)
    return []
  }
  return (data ?? []) as CategoryRow[]
}

// ---------- Per-transaction assignment ----------

/**
 * User chose a category from the picker. Always stamps source='user'.
 * Pass categoryId=null to clear (use clearTransactionCategory for clarity).
 */
export async function setTransactionCategory(
  transactionId: string,
  categoryId: string | null,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('transactions')
    .update({
      category_id: categoryId,
      category_source: categoryId ? 'user' : null,
    } as any)
    .eq('id', transactionId)
  if (error) throw new Error(error.message)
  revalidateCategorySurfaces()
}

/**
 * Confirm an AI-applied category — flips source from 'ai' to 'user'.
 * Used by the ✓ control on the AI-styled pill.
 */
export async function confirmAiCategory(transactionId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('transactions')
    .update({ category_source: 'user' } as any)
    .eq('id', transactionId)
    .eq('category_source', 'ai')
  if (error) throw new Error(error.message)
  revalidateCategorySurfaces()
}

export async function clearTransactionCategory(transactionId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('transactions')
    .update({ category_id: null, category_source: null } as any)
    .eq('id', transactionId)
  if (error) throw new Error(error.message)
  revalidateCategorySurfaces()
}

// Same three actions but operating on staging (transaction_imports) so the
// review screen can confirm/clear/override AI picks before promote.
export async function setImportCategory(importId: string, categoryId: string | null): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('transaction_imports')
    .update({
      category_id: categoryId,
      category_source: categoryId ? 'user' : null,
    } as any)
    .eq('id', importId)
  if (error) throw new Error(error.message)
  revalidateCategorySurfaces()
}

export async function confirmAiImportCategory(importId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('transaction_imports')
    .update({ category_source: 'user' } as any)
    .eq('id', importId)
    .eq('category_source', 'ai')
  if (error) throw new Error(error.message)
  revalidateCategorySurfaces()
}

export async function clearImportCategory(importId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('transaction_imports')
    .update({ category_id: null, category_source: null } as any)
    .eq('id', importId)
  if (error) throw new Error(error.message)
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
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Unauthorized')

  const name = normalizeCategoryName(input.name)
  if (!name) throw new Error('Category name is required')

  const { data, error } = await supabase
    .from('tags')
    .insert({
      name,
      parent_id: input.parentId ?? null,
      description: input.description ?? null,
      color: input.color ?? null,
      kind: 'category',
      user_id: userData.user.id,
    } as any)
    .select('id, name, description, parent_id, color')
    .single()

  if (error) throw new Error(error.message)

  // Embed the new category so it joins KNN/tag-embed matching as soon as
  // possible. If description is empty, embedding is name-only — still useful.
  after(async () => {
    await embedTags(supabase, [(data as any).id])
  })

  revalidateCategorySurfaces()
  return data as CategoryRow
}

export async function renameCategory(id: string, newName: string): Promise<CategoryRow> {
  const supabase = await createClient()
  const name = normalizeCategoryName(newName)
  if (!name) throw new Error('Category name is required')

  const { data, error } = await supabase
    .from('tags')
    .update({ name } as any)
    .eq('id', id)
    .eq('kind', 'category')
    .select('id, name, description, parent_id, color')
    .single()
  if (error) throw new Error(error.message)

  after(async () => {
    await embedTags(supabase, [id])
  })

  revalidateCategorySurfaces()
  return data as CategoryRow
}

export async function updateCategory(
  id: string,
  patch: { description?: string | null; color?: string | null; parentId?: string | null },
): Promise<CategoryRow> {
  const supabase = await createClient()
  const updates: any = {}
  if (patch.description !== undefined) updates.description = patch.description
  if (patch.color !== undefined) updates.color = patch.color
  if (patch.parentId !== undefined) updates.parent_id = patch.parentId

  const { data, error } = await supabase
    .from('tags')
    .update(updates)
    .eq('id', id)
    .eq('kind', 'category')
    .select('id, name, description, parent_id, color')
    .single()
  if (error) throw new Error(error.message)

  if (patch.description !== undefined) {
    after(async () => {
      await embedTags(supabase, [id])
    })
  }

  revalidateCategorySurfaces()
  return data as CategoryRow
}

/**
 * Delete a category. Reassigns affected transactions to the parent (or to
 * NULL if top-level). Children of a deleted top-level get re-parented to
 * NULL — they become new top-levels.
 */
export async function deleteCategory(id: string): Promise<void> {
  const supabase = await createClient()

  const { data: target } = await supabase
    .from('tags')
    .select('parent_id')
    .eq('id', id)
    .eq('kind', 'category')
    .maybeSingle()
  const newParentForTransactions = (target as { parent_id: string | null } | null)?.parent_id ?? null

  // Reassign transactions and imports.
  await supabase
    .from('transactions')
    .update({ category_id: newParentForTransactions } as any)
    .eq('category_id', id)
  await supabase
    .from('transaction_imports')
    .update({ category_id: newParentForTransactions } as any)
    .eq('category_id', id)

  // Re-parent children to NULL — they become top-level.
  await supabase
    .from('tags')
    .update({ parent_id: null } as any)
    .eq('parent_id', id)
    .eq('kind', 'category')

  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', id)
    .eq('kind', 'category')
  if (error) throw new Error(error.message)

  revalidateCategorySurfaces()
}

/**
 * Re-runs LLM categorization for any of the user's transactions still
 * uncategorized. Useful after a model / prompt upgrade — existing data
 * stays untouched until this is invoked. Embeds rows that lack a
 * description_embedding so KNN/tag-embed signals warm up too. Budgeted via
 * the existing user_settings.ai_monthly_budget_cents path.
 */
export async function recategorizeUncategorized(): Promise<{
  categorized: number
  attempted: number
  budgetExhausted: boolean
}> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Unauthorized')
  const userId = userData.user.id

  // Backfill missing embeddings first so KNN / tag-embed have signal once
  // the LLM lands category_id values.
  const { data: missingEmbed } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .is('description_embedding', null)
    .eq('status', 'active')
    .limit(2000)
  const missingIds = ((missingEmbed ?? []) as { id: string }[]).map(r => r.id)
  if (missingIds.length > 0) {
    await embedTransactions(supabase, missingIds)
  }

  const result = await recategorizeUncategorizedTransactions(supabase, userId)
  revalidateCategorySurfaces()
  return result
}

/**
 * Re-runs the country seed for the current user. Idempotent: only inserts
 * names the user is missing. Does not modify renamed categories.
 */
export async function restoreDefaultCategories(): Promise<{ inserted: number; skipped: number }> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Unauthorized')

  const { data: settings } = await supabase
    .from('user_settings')
    .select('country')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  const country = (settings as { country?: string } | null)?.country ?? 'default'

  const result = await seedCategoriesForUser(supabase, userData.user.id, country)
  revalidateCategorySurfaces()
  return result
}
