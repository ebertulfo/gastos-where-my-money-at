import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { tags as tagsTable, transactions, userSettings } from '@/db/schema'
import { embedTexts } from './embed'
import { suggestViaLLM } from './llm'
import type { NeighbourRow, TagEmbedCandidate, TagNode, TagSuggestion } from './types'

const STRONG_THRESHOLD = 0.75
const WEAK_THRESHOLD = 0.5
const KNN_LIMIT = 20
const MIN_STRONG_FOR_PURE_KNN = 3
const PRIMARY_WEIGHT_MULTIPLIER = 1.5

const TAG_EMBED_LIMIT = 10
const TAG_EMBED_MIN_SIMILARITY = 0.30
const TAG_EMBED_STRONG_SIMILARITY = 0.35
const MIN_STRONG_FOR_TAG_EMBED_ONLY = 2
const TAG_EMBED_BLEND_WEIGHT = 0.4

interface SuggestArgs {
  userId: string
  transactionId: string
  limit?: number
}

/**
 * Hybrid: three signals, picked in order of strength.
 * 1. KNN over the user's tagged history (existing) — dominant when the
 *    user has tagged similar merchants before.
 * 2. Tag embeddings (name + description vs the transaction) — picks up
 *    semantic matches even on first encounter.
 * 3. LLM fallback — only when both above produce nothing usable.
 */
export async function suggestTagsForTransaction(args: SuggestArgs): Promise<TagSuggestion[]> {
  const { userId, transactionId } = args
  const limit = args.limit ?? 5

  const [tx] = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      date: transactions.date,
      descriptionEmbedding: transactions.descriptionEmbedding,
    })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
    .limit(1)

  if (!tx) return []

  let txEmbedding: number[] | null = tx.descriptionEmbedding ?? null
  if (!txEmbedding) {
    const result = await embedTexts([tx.description])
    if (result && result.embeddings.length > 0) {
      txEmbedding = result.embeddings[0]
      // Persist in background; ignore failures.
      db
        .update(transactions)
        .set({ descriptionEmbedding: txEmbedding })
        .where(eq(transactions.id, transactionId))
        .then(() => undefined, () => undefined)
    }
  }

  const tagRows = await db
    .select({
      id: tagsTable.id,
      name: tagsTable.name,
      color: tagsTable.color,
      parentId: tagsTable.parentId,
    })
    .from(tagsTable)
    .where(eq(tagsTable.userId, userId))

  const tags: TagNode[] = tagRows.map(t => ({
    id: t.id,
    name: t.name,
    color: t.color,
    parentId: t.parentId,
  }))

  if (tags.length === 0) return []

  let strong: NeighbourRow[] = []
  let weak: NeighbourRow[] = []
  let tagEmbed: TagEmbedCandidate[] = []
  if (txEmbedding) {
    const [neighbours, tagCandidates] = await Promise.all([
      knnNeighbours(userId, transactionId, txEmbedding),
      knnNearestTags(userId, txEmbedding),
    ])
    for (const n of neighbours) {
      if (n.similarity >= STRONG_THRESHOLD) strong.push(n)
      else if (n.similarity >= WEAK_THRESHOLD) weak.push(n)
    }
    tagEmbed = tagCandidates
  }

  const useableTagEmbed = tagEmbed.filter(c => c.similarity >= TAG_EMBED_MIN_SIMILARITY)
  const strongTagEmbed = tagEmbed.filter(c => c.similarity >= TAG_EMBED_STRONG_SIMILARITY)

  let raw: TagSuggestion[]
  if (strong.length >= MIN_STRONG_FOR_PURE_KNN) {
    raw = voteFromKNNWithTagEmbed(strong, useableTagEmbed, limit)
  } else if (strongTagEmbed.length >= MIN_STRONG_FOR_TAG_EMBED_ONLY) {
    raw = tagEmbedAsSuggestions(strongTagEmbed, limit)
  } else {
    const [settings] = await db
      .select({ country: userSettings.country })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1)
    const country = settings?.country ?? null

    const llmSuggestions = await suggestViaLLM({
      userId,
      tx: { description: tx.description, amount: Number(tx.amount), date: tx.date },
      tags,
      fewShotNeighbours: weak,
      userCountry: country,
    })

    const knnTagIds = new Set<string>()
    for (const n of [...strong, ...weak]) {
      for (const t of n.tags) knnTagIds.add(t.tagId)
    }
    raw = mergeLLMWithTagEmbed(llmSuggestions, useableTagEmbed, knnTagIds, limit)
  }

  const collapsed = collapseHierarchy(raw, tags)

  return collapsed.slice(0, limit)
}

interface KNNNeighbourRow {
  id: string
  description: string
  similarity: number
  transaction_tags: { tag_id: string; is_primary: boolean }[] | null
}

// pgvector accepts a JSON-array-style string for the parameter. Drizzle's
// vector column type writes literal vector format on update; for RPC params
// we serialize manually.
function vectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

async function knnNeighbours(
  userId: string,
  excludeId: string,
  embedding: number[],
): Promise<NeighbourRow[]> {
  try {
    const result = await db.execute(
      sql`select * from knn_neighbour_tags(${userId}, ${excludeId}::uuid, ${vectorLiteral(embedding)}::vector(1536), ${KNN_LIMIT})`,
    )
    const rows = ((result as unknown as { rows?: KNNNeighbourRow[] }).rows
      ?? (result as unknown as KNNNeighbourRow[]))
    return rows.map(r => ({
      transactionId: r.id,
      description: r.description,
      similarity: r.similarity,
      tags: (r.transaction_tags ?? []).map(t => ({ tagId: t.tag_id, isPrimary: t.is_primary })),
    }))
  } catch {
    return []
  }
}

interface TagEmbedRow {
  id: string
  name: string
  similarity: number
}

async function knnNearestTags(
  userId: string,
  embedding: number[],
): Promise<TagEmbedCandidate[]> {
  try {
    const result = await db.execute(
      sql`select * from knn_nearest_tags(${userId}, ${vectorLiteral(embedding)}::vector(1536), ${TAG_EMBED_LIMIT})`,
    )
    const rows = ((result as unknown as { rows?: TagEmbedRow[] }).rows
      ?? (result as unknown as TagEmbedRow[]))
    return rows.map(r => ({
      tagId: r.id,
      name: r.name,
      similarity: r.similarity,
    }))
  } catch {
    return []
  }
}

function tagEmbedAsSuggestions(
  candidates: TagEmbedCandidate[],
  limit: number,
): TagSuggestion[] {
  if (candidates.length === 0) return []
  const top = candidates[0].similarity
  return candidates.slice(0, limit).map(c => ({
    tagId: c.tagId,
    confidence: top > 0 ? c.similarity / top : 0,
    source: 'tag-embed' as const,
  }))
}

function mergeLLMWithTagEmbed(
  llm: TagSuggestion[],
  tagEmbed: TagEmbedCandidate[],
  knnTagIds: Set<string>,
  limit: number,
): TagSuggestion[] {
  const byId = new Map<string, TagSuggestion>()

  for (const s of llm) {
    const supported = knnTagIds.has(s.tagId) || tagEmbed.some(c => c.tagId === s.tagId)
    byId.set(s.tagId, { ...s, source: supported ? 'mixed' : 'llm' })
  }

  for (const c of tagEmbed) {
    if (byId.has(c.tagId)) continue
    byId.set(c.tagId, {
      tagId: c.tagId,
      confidence: c.similarity,
      source: 'tag-embed',
    })
  }

  return Array.from(byId.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
}

interface BlendEntry {
  score: number
  fromKNN: boolean
  fromTagEmbed: boolean
}

function voteFromKNNWithTagEmbed(
  neighbours: NeighbourRow[],
  tagEmbed: TagEmbedCandidate[],
  limit: number,
): TagSuggestion[] {
  const entries = new Map<string, BlendEntry>()

  let rawKnnTop = 0
  const knnRaw = new Map<string, number>()
  for (const n of neighbours) {
    for (const t of n.tags) {
      const w = n.similarity * (t.isPrimary ? PRIMARY_WEIGHT_MULTIPLIER : 1)
      knnRaw.set(t.tagId, (knnRaw.get(t.tagId) ?? 0) + w)
    }
  }
  for (const v of knnRaw.values()) rawKnnTop = Math.max(rawKnnTop, v)

  for (const [tagId, rawScore] of knnRaw) {
    const normalized = rawKnnTop > 0 ? rawScore / rawKnnTop : 0
    entries.set(tagId, { score: normalized, fromKNN: true, fromTagEmbed: false })
  }

  for (const c of tagEmbed) {
    const existing = entries.get(c.tagId)
    const bump = c.similarity * TAG_EMBED_BLEND_WEIGHT
    if (existing) {
      existing.score += bump
      existing.fromTagEmbed = true
    } else {
      entries.set(c.tagId, { score: bump, fromKNN: false, fromTagEmbed: true })
    }
  }

  const sorted = Array.from(entries.entries()).sort((a, b) => b[1].score - a[1].score)
  if (sorted.length === 0) return []
  const top = sorted[0][1].score
  return sorted.slice(0, limit).map(([tagId, e]) => ({
    tagId,
    confidence: top > 0 ? e.score / top : 0,
    source: (e.fromKNN && e.fromTagEmbed
      ? 'mixed'
      : e.fromKNN
        ? 'knn'
        : 'tag-embed') as TagSuggestion['source'],
  }))
}

/**
 * Drops any tag whose descendant is also in the output. "Coffee" wins over
 * "Food" if both score; transitive (grandchild → grandparent) is handled too.
 */
export function collapseHierarchy(suggestions: TagSuggestion[], tags: TagNode[]): TagSuggestion[] {
  if (suggestions.length === 0) return suggestions

  const parentOf = new Map<string, string | null>(tags.map(t => [t.id, t.parentId]))

  function ancestorsOf(tagId: string): string[] {
    const out: string[] = []
    let cur = parentOf.get(tagId) ?? null
    const seen = new Set<string>([tagId])
    while (cur && !seen.has(cur)) {
      out.push(cur)
      seen.add(cur)
      cur = parentOf.get(cur) ?? null
    }
    return out
  }

  const suggestedIds = new Set(suggestions.map(s => s.tagId))
  const suppress = new Set<string>()
  for (const s of suggestions) {
    for (const ancestorId of ancestorsOf(s.tagId)) {
      if (suggestedIds.has(ancestorId)) suppress.add(ancestorId)
    }
  }
  return suggestions.filter(s => !suppress.has(s.tagId))
}
