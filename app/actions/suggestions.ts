'use server'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db'
import { transactions } from '@/db/schema'
import { getUserId } from '@/lib/auth'
import { embedTransactions } from '@/lib/suggest/embed'
import { suggestTagsForTransaction } from '@/lib/suggest/suggest'
import type { TagSuggestion } from '@/lib/suggest/types'

export async function suggestTagsForTransactionAction(
  transactionId: string,
  limit = 5,
): Promise<TagSuggestion[]> {
  const userId = await getUserId()
  if (!userId) return []

  return suggestTagsForTransaction({ userId, transactionId, limit })
}

/**
 * Backfill embeddings for the current user's transactions.
 *
 * - Default (`force=false`): only rows where `description_embedding is null`
 *   get embedded. Cheap and idempotent.
 * - `force=true`: re-embeds every row regardless of current state.
 */
export async function backfillTransactionEmbeddings(
  options: { force?: boolean } = {},
): Promise<{ embedded: number }> {
  const userId = await getUserId()
  if (!userId) return { embedded: 0 }

  const conditions = options.force
    ? eq(transactions.userId, userId)
    : and(eq(transactions.userId, userId), isNull(transactions.descriptionEmbedding))

  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(conditions)
    .limit(2000)

  return embedTransactions(rows.map(r => r.id))
}
