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
 *
 * After inserts: kicks off `embedTags` so KNN/tag-embed has signal. The
 * embed call is awaited inside this function (not fire-and-forget) because
 * the immediate next thing for a new user is usually to upload a statement,
 * and auto-apply needs the embeddings present.
 */
export async function seedCategoriesForUser(
  supabase: any,
  userId: string,
  country: string | null | undefined,
): Promise<SeedResult> {
  const seed = getSeedForCountry(country)

  // What does the user already have?
  const { data: existing } = await supabase
    .from('tags')
    .select('id, name, parent_id, kind')
    .eq('user_id', userId)
    .eq('kind', 'category')

  const existingByName = new Map<string, { id: string; parent_id: string | null }>(
    ((existing ?? []) as { id: string; name: string; parent_id: string | null }[]).map(
      r => [r.name, { id: r.id, parent_id: r.parent_id }],
    ),
  )

  let inserted = 0
  let skipped = 0
  const newlyInsertedIds: string[] = []

  // Pass 1: top-level. Need their ids before we can insert children.
  const topLevelIdByName = new Map<string, string>()

  for (const node of seed) {
    if (existingByName.has(node.name)) {
      topLevelIdByName.set(node.name, existingByName.get(node.name)!.id)
      skipped++
      continue
    }
    const { data, error } = await supabase
      .from('tags')
      .insert({
        user_id: userId,
        name: node.name,
        description: node.description,
        kind: 'category',
        parent_id: null,
      })
      .select('id')
      .single()
    if (error || !data) continue
    topLevelIdByName.set(node.name, (data as { id: string }).id)
    newlyInsertedIds.push((data as { id: string }).id)
    inserted++
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
      const { data, error } = await supabase
        .from('tags')
        .insert({
          user_id: userId,
          name: child.name,
          description: child.description,
          kind: 'category',
          parent_id: parentId,
        })
        .select('id')
        .single()
      if (error || !data) continue
      newlyInsertedIds.push((data as { id: string }).id)
      inserted++
    }
  }

  // Embed only the newly-inserted rows. Existing ones already had their
  // embeddings done at their original seed time.
  if (newlyInsertedIds.length > 0) {
    await embedTags(supabase, newlyInsertedIds)
  }

  return { inserted, skipped }
}

export type { SeedNode }
