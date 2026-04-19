import { embedTexts } from './embed'
import { suggestViaLLM } from './llm'
import type { NeighbourRow, TagEmbedCandidate, TagNode, TagSuggestion } from './types'

const STRONG_THRESHOLD = 0.75
const WEAK_THRESHOLD = 0.5
const KNN_LIMIT = 20
const MIN_STRONG_FOR_PURE_KNN = 3
const PRIMARY_WEIGHT_MULTIPLIER = 1.5

// Tag embeddings are (name + description) vs merchant text — different
// register, so absolute cosine similarities run lower than transaction-
// to-transaction scores. Calibrated by eye; tune once we have real data.
const TAG_EMBED_LIMIT = 10
const TAG_EMBED_MIN_SIMILARITY = 0.30
const TAG_EMBED_STRONG_SIMILARITY = 0.35
const MIN_STRONG_FOR_TAG_EMBED_ONLY = 2
// How much a tag-embed hit contributes on top of a KNN-winning tag.
// KNN normalized to [0, 1]; this caps tag-embed's additive bump.
const TAG_EMBED_BLEND_WEIGHT = 0.4

interface SuggestArgs {
  supabase: any
  userId: string
  transactionId: string
  limit?: number
}

interface TransactionRow {
  id: string
  description: string
  amount: number
  date: string
  description_embedding: number[] | null
}

/**
 * Hybrid: three signals, picked in order of strength.
 * 1. KNN over the user's tagged history (existing) — dominant when the
 *    user has tagged similar merchants before.
 * 2. Tag embeddings (name + description vs the transaction) — picks up
 *    semantic matches even on first encounter ("OSAKA JP" → Japan).
 * 3. LLM fallback — only when both above produce nothing usable.
 * Hierarchy collapse runs at the end so child tags win over parents.
 */
export async function suggestTagsForTransaction(args: SuggestArgs): Promise<TagSuggestion[]> {
  const { supabase, userId, transactionId } = args
  const limit = args.limit ?? 5

  // 1. Fetch the transaction (and its embedding if present).
  const { data: txData, error: txError } = await supabase
    .from('transactions')
    .select('id, description, amount, date, description_embedding')
    .eq('id', transactionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (txError || !txData) return []
  const tx = txData as TransactionRow

  // 2. Lazily embed if missing. Persist in the background so the next
  // suggestion pass on this row skips the call.
  let txEmbedding = tx.description_embedding
  if (!txEmbedding) {
    const result = await embedTexts([tx.description])
    if (!result || result.embeddings.length === 0) {
      txEmbedding = null
    } else {
      txEmbedding = result.embeddings[0]
      supabase
        .from('transactions')
        .update({ description_embedding: txEmbedding as any })
        .eq('id', transactionId)
        .then(() => undefined, () => undefined)
    }
  }

  // 3. Fetch user's tags (always — needed for every path).
  const { data: tagsData } = await supabase
    .from('tags')
    .select('id, name, color, parent_id')
    .eq('user_id', userId)

  const tags: TagNode[] = ((tagsData ?? []) as { id: string; name: string; color: string | null; parent_id: string | null }[]).map(t => ({
    id: t.id,
    name: t.name,
    color: t.color,
    parentId: t.parent_id,
  }))

  if (tags.length === 0) return []

  // 4. Fetch both KNN signals in parallel when we have an embedding.
  let strong: NeighbourRow[] = []
  let weak: NeighbourRow[] = []
  let tagEmbed: TagEmbedCandidate[] = []
  if (txEmbedding) {
    const [neighbours, tagCandidates] = await Promise.all([
      knnNeighbours(supabase, userId, transactionId, txEmbedding),
      knnNearestTags(supabase, userId, txEmbedding),
    ])
    for (const n of neighbours) {
      if (n.similarity >= STRONG_THRESHOLD) strong.push(n)
      else if (n.similarity >= WEAK_THRESHOLD) weak.push(n)
    }
    tagEmbed = tagCandidates
  }

  const useableTagEmbed = tagEmbed.filter(c => c.similarity >= TAG_EMBED_MIN_SIMILARITY)
  const strongTagEmbed = tagEmbed.filter(c => c.similarity >= TAG_EMBED_STRONG_SIMILARITY)

  // 5. Decision branch.
  let raw: TagSuggestion[]
  if (strong.length >= MIN_STRONG_FOR_PURE_KNN) {
    // KNN dominates; tag-embed augments.
    raw = voteFromKNNWithTagEmbed(strong, useableTagEmbed, limit)
  } else if (strongTagEmbed.length >= MIN_STRONG_FOR_TAG_EMBED_ONLY) {
    // No prior user history for this merchant, but tag descriptions match.
    raw = tagEmbedAsSuggestions(strongTagEmbed, limit)
  } else {
    // Fall back to LLM with weak KNN as few-shot, then union tag-embed
    // candidates so semantically-obvious tags (e.g. "japan" for a JR JP
    // transaction) aren't dropped just because the LLM picked functional
    // categories (hotels/flights/activities) instead.
    const { data: settingsData } = await supabase
      .from('user_settings')
      .select('country')
      .eq('user_id', userId)
      .maybeSingle()
    const country = (settingsData as { country?: string } | null)?.country ?? null

    const llmSuggestions = await suggestViaLLM({
      userId,
      tx: { description: tx.description, amount: tx.amount, date: tx.date },
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

  // 6. Hierarchy collapse — drop ancestors whose descendants are in.
  const collapsed = collapseHierarchy(raw, tags)

  return collapsed.slice(0, limit)
}

interface KNNRowJoin {
  id: string
  description: string
  similarity: number
  transaction_tags: { tag_id: string; is_primary: boolean }[]
}

async function knnNeighbours(
  supabase: any,
  userId: string,
  excludeId: string,
  embedding: number[],
): Promise<NeighbourRow[]> {
  const { data, error } = await supabase.rpc('knn_neighbour_tags', {
    p_user_id: userId,
    p_exclude_id: excludeId,
    p_embedding: embedding as unknown as string,
    p_limit: KNN_LIMIT,
  })

  if (error || !data) return []

  return (data as KNNRowJoin[]).map(r => ({
    transactionId: r.id,
    description: r.description,
    similarity: r.similarity,
    tags: (r.transaction_tags ?? []).map(t => ({ tagId: t.tag_id, isPrimary: t.is_primary })),
  }))
}

interface TagEmbedRow {
  id: string
  name: string
  similarity: number
}

async function knnNearestTags(
  supabase: any,
  userId: string,
  embedding: number[],
): Promise<TagEmbedCandidate[]> {
  const { data, error } = await supabase.rpc('knn_nearest_tags', {
    p_user_id: userId,
    p_embedding: embedding as unknown as string,
    p_limit: TAG_EMBED_LIMIT,
  })

  if (error || !data) return []

  return (data as TagEmbedRow[]).map(r => ({
    tagId: r.id,
    name: r.name,
    similarity: r.similarity,
  }))
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

/**
 * LLM-primary merge: the LLM's ranking drives the top slots, but any
 * tag-embed hit the LLM missed is unioned onto the end with a confidence
 * derived from similarity. Overlaps get annotated as 'mixed'.
 *
 * Callers pass the KNN-derived tag IDs only to annotate overlap sources,
 * not to contribute scores (the KNN signal was too weak to dominate, else
 * we'd have taken the KNN branch).
 */
function mergeLLMWithTagEmbed(
  llm: TagSuggestion[],
  tagEmbed: TagEmbedCandidate[],
  knnTagIds: Set<string>,
  limit: number,
): TagSuggestion[] {
  const byId = new Map<string, TagSuggestion>()

  // Annotate LLM picks with 'mixed' where another signal agrees.
  for (const s of llm) {
    const supported = knnTagIds.has(s.tagId) || tagEmbed.some(c => c.tagId === s.tagId)
    byId.set(s.tagId, { ...s, source: supported ? 'mixed' : 'llm' })
  }

  // Append tag-embed-only candidates. Confidence = similarity (already in
  // [0, 1]-ish); the LLM's rank-based confidences start at 1.0, so these
  // sort below the LLM's top pick unless similarity is very high — which
  // is exactly the ordering we want.
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

  // KNN vote (same weighting as before — similarity × primary multiplier).
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

  // Tag-embed contribution: additive, capped at TAG_EMBED_BLEND_WEIGHT × sim.
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

  // Any suggested tag that is an ancestor of any OTHER suggested tag gets
  // suppressed. Order is preserved.
  const suggestedIds = new Set(suggestions.map(s => s.tagId))
  const suppress = new Set<string>()
  for (const s of suggestions) {
    for (const ancestorId of ancestorsOf(s.tagId)) {
      if (suggestedIds.has(ancestorId)) suppress.add(ancestorId)
    }
  }
  return suggestions.filter(s => !suppress.has(s.tagId))
}
