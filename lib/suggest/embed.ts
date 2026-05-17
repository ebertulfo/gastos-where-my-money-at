import { eq, inArray } from 'drizzle-orm'

import { db } from '@/lib/db'
import { tags, transactions } from '@/db/schema'
import { EMBEDDING_MODEL, estimateEmbeddingCents, getOpenAIClient } from './client'
import { normalizeForEmbedding } from './normalize'

/**
 * Builds the text we embed for a tag. Name + description concatenated so
 * the vector carries both the label and the user's (or LLM-seeded)
 * semantic cues. Uses the same merchant-text normalizer as the transaction
 * side so country-code expansion and casing line up in a single embedding
 * space.
 */
export function composeTagEmbedText(name: string, description: string | null): string {
  const combined = description && description.trim().length > 0
    ? `${name}\n${description}`
    : name
  return normalizeForEmbedding(combined)
}

const MAX_INPUTS_PER_CALL = 256

interface EmbedResult {
  embeddings: number[][]
  usageCents: number
  totalTokens: number
}

export async function embedTexts(
  texts: string[],
  opts?: { preNormalized?: boolean },
): Promise<EmbedResult | null> {
  const client = getOpenAIClient()
  if (!client) return null
  if (texts.length === 0) {
    return { embeddings: [], usageCents: 0, totalTokens: 0 }
  }

  const cleaned = opts?.preNormalized ? texts : texts.map(t => normalizeForEmbedding(t))
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

/**
 * Embeds the listed transactions and writes the vectors back to
 * `transactions.description_embedding`. Best-effort — swallows errors so a
 * failed embedding pass never blocks the caller.
 */
export async function embedTransactions(
  transactionIds: string[],
): Promise<{ embedded: number }> {
  if (transactionIds.length === 0) return { embedded: 0 }

  try {
    const txs = await db
      .select({ id: transactions.id, description: transactions.description })
      .from(transactions)
      .where(inArray(transactions.id, transactionIds))

    if (txs.length === 0) return { embedded: 0 }

    const result = await embedTexts(txs.map(t => t.description))
    if (!result) return { embedded: 0 }

    await Promise.all(
      txs.map((tx, i) =>
        db
          .update(transactions)
          .set({ descriptionEmbedding: result.embeddings[i] })
          .where(eq(transactions.id, tx.id))
      ),
    )
    return { embedded: txs.length }
  } catch {
    console.warn('embedTransactions failed')
    return { embedded: 0 }
  }
}

/**
 * Embeds the listed tags from name + description and writes the vectors
 * back to `tags.embedding`. Best-effort.
 */
export async function embedTags(tagIds: string[]): Promise<{ embedded: number }> {
  if (tagIds.length === 0) return { embedded: 0 }

  try {
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        description: tags.description,
      })
      .from(tags)
      .where(inArray(tags.id, tagIds))

    if (rows.length === 0) return { embedded: 0 }

    const texts = rows.map(t => composeTagEmbedText(t.name, t.description))
    const result = await embedTexts(texts, { preNormalized: true })
    if (!result) return { embedded: 0 }

    await Promise.all(
      rows.map((tag, i) =>
        db
          .update(tags)
          .set({ embedding: result.embeddings[i] })
          .where(eq(tags.id, tag.id))
      ),
    )
    return { embedded: rows.length }
  } catch {
    console.warn('embedTags failed')
    return { embedded: 0 }
  }
}
