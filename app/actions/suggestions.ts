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
 * Backfill embeddings for the current user's transactions.
 *
 * - Default (`force=false`): only rows where `description_embedding is null`
 *   get embedded. Cheap and idempotent — safe to call on page load.
 * - `force=true`: re-embeds every row regardless of current state. Use after
 *   meaningful changes to the normalize regex (e.g. when we stop stripping a
 *   token that turns out to carry signal). Costs tokens.
 */
export async function backfillTransactionEmbeddings(
  options: { force?: boolean } = {},
): Promise<{ embedded: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { embedded: 0 }

  let query = (supabase as any)
    .from('transactions')
    .select('id')
    .eq('user_id', user.id)
    .limit(2000)

  if (!options.force) {
    query = query.is('description_embedding', null)
  }

  const { data, error } = await query
  if (error || !data) return { embedded: 0 }
  const ids = (data as { id: string }[]).map(r => r.id)
  return embedTransactions(supabase, ids)
}
