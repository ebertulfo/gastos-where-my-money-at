'use server'

import { createClient } from '@/lib/supabase/server'
import { embedTransactions } from '@/lib/suggest/embed'
import { suggestTagsForTransaction } from '@/lib/suggest/suggest'
import type { TagSuggestion } from '@/lib/suggest/types'

export async function suggestTagsForTransactionAction(
  transactionId: string,
  limit = 5,
): Promise<TagSuggestion[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  return suggestTagsForTransaction({
    supabase,
    userId: user.id,
    transactionId,
    limit,
  })
}

/**
 * One-shot backfill for transactions that predate the embeddings column.
 * Operates on the current user only. Idempotent: rows that already have
 * embeddings are skipped.
 */
export async function backfillTransactionEmbeddings(): Promise<{ embedded: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { embedded: 0 }

  const { data, error } = await (supabase as any)
    .from('transactions')
    .select('id')
    .eq('user_id', user.id)
    .is('description_embedding', null)
    .limit(2000)

  if (error || !data) return { embedded: 0 }
  const ids = (data as { id: string }[]).map(r => r.id)
  return embedTransactions(supabase, ids)
}
