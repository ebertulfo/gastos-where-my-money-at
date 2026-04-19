import { EMBEDDING_MODEL, estimateEmbeddingCents, getOpenAIClient } from './client'
import { normalizeForEmbedding } from './normalize'

const MAX_INPUTS_PER_CALL = 256

interface EmbedResult {
  embeddings: number[][]
  usageCents: number
  totalTokens: number
}

export async function embedTexts(texts: string[]): Promise<EmbedResult | null> {
  const client = getOpenAIClient()
  if (!client) return null
  if (texts.length === 0) {
    return { embeddings: [], usageCents: 0, totalTokens: 0 }
  }

  const cleaned = texts.map(t => normalizeForEmbedding(t))
  const out: number[][] = []
  let totalTokens = 0

  for (let i = 0; i < cleaned.length; i += MAX_INPUTS_PER_CALL) {
    const batch = cleaned.slice(i, i + MAX_INPUTS_PER_CALL)
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    })
    for (const item of response.data) out.push(item.embedding as number[])
    totalTokens += response.usage?.total_tokens ?? 0
  }

  return {
    embeddings: out,
    usageCents: estimateEmbeddingCents(totalTokens),
    totalTokens,
  }
}

interface ImportTx {
  id: string
  description: string
}

/**
 * Embeds the listed transactions and writes the vectors back to
 * `transactions.description_embedding`. Best-effort — swallows errors so a
 * failed embedding pass never blocks the caller (e.g. confirmStatementImport).
 *
 * Caller is expected to pass the supabase client; we don't construct one
 * here so this works in both RSC and route-handler contexts.
 */
export async function embedTransactions(
  supabase: any,
  transactionIds: string[],
): Promise<{ embedded: number }> {
  if (transactionIds.length === 0) return { embedded: 0 }

  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, description')
      .in('id', transactionIds)

    if (error || !data) return { embedded: 0 }
    const txs = data as ImportTx[]
    if (txs.length === 0) return { embedded: 0 }

    const result = await embedTexts(txs.map(t => t.description))
    if (!result) return { embedded: 0 }

    // Update each row with its vector. pgvector accepts the array literal
    // via supabase-js; cast as any since the generated type is `number[]`
    // without the vector type marker.
    const updates = txs.map((tx, i) =>
      supabase
        .from('transactions')
        .update({ description_embedding: result.embeddings[i] as any })
        .eq('id', tx.id)
    )
    await Promise.all(updates)
    return { embedded: txs.length }
  } catch (err) {
    console.warn('embedTransactions failed')
    return { embedded: 0 }
  }
}
