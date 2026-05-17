'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { tags as tagsTable, transactionTags, transactions, userSettings } from '@/db/schema'
import { requireUserId } from '@/lib/auth'
import { tag as cacheTag } from '@/lib/cache/tags'
import { detectTripClusters, type TripCluster } from '@/lib/suggest/trip-cluster'
import { nameTripCluster } from '@/lib/suggest/llm'
import { friendlyCountry } from '@/lib/suggest/locale'
import { embedTags } from '@/lib/suggest/embed'

const MAX_NAMING_CALLS_PER_RUN = 6

export interface TripCandidate {
  /** Transient id; only meaningful for the lifetime of the modal. */
  clusterId: string
  proposedName: string
  startDate: string
  endDate: string
  totalAmount: number
  currencies: string[]
  /** Sample of distinct merchant strings, capped for display. */
  sampleMerchants: string[]
  rowCount: number
  transactionIds: string[]
}

export interface TripBreakdownRow {
  labelId: string
  labelName: string
  labelColor: string | null
  amount: number
  count: number
  startDate: string
  endDate: string
}

/**
 * Detect candidate trips from `is_travel = true` rows. Each cluster gets
 * one LLM call (capped) for its label name; clusters past the cap fall back
 * to a deterministic "trip · <date range>" name.
 */
export async function detectTrips(): Promise<TripCandidate[]> {
  const userId = await requireUserId()
  const clusters = await detectTripClusters(userId)
  if (clusters.length === 0) return []

  const [settings] = await db
    .select({ country: userSettings.country, currency: userSettings.currency })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  const userCountry = settings?.country ?? null
  const homeCurrency = (settings?.currency ?? '').toUpperCase() || null

  // Largest clusters first — they're the most likely to be real trips and
  // most worth spending the LLM budget on.
  const sorted = [...clusters].sort((a, b) => b.rows.length - a.rows.length)

  const candidates: TripCandidate[] = []
  let llmCallsUsed = 0
  for (const cluster of sorted) {
    let name: string | null = null
    if (llmCallsUsed < MAX_NAMING_CALLS_PER_RUN) {
      llmCallsUsed += 1
      name = await nameTripCluster({
        userId,
        descriptions: cluster.rows.map(r => r.description),
        startDate: cluster.startDate,
        endDate: cluster.endDate,
        currencies: cluster.currencies,
        userCountry: userCountry ? friendlyCountry(userCountry) : null,
        homeCurrency,
      })
    }

    candidates.push({
      clusterId: cluster.clusterId,
      proposedName: name ?? deterministicName(cluster),
      startDate: cluster.startDate,
      endDate: cluster.endDate,
      totalAmount: cluster.totalAmount,
      currencies: cluster.currencies,
      sampleMerchants: distinctMerchants(cluster, 6),
      rowCount: cluster.rows.length,
      transactionIds: cluster.rows.map(r => r.id),
    })
  }
  return candidates
}

/**
 * Materialize a trip: create the label (or reuse an existing one with the
 * same normalized name) and link every passed transaction id. Bumps the
 * label's embedding so future find-similar / KNN paths recognize it.
 */
export async function applyTrip(input: {
  name: string
  transactionIds: string[]
}): Promise<{ labelId: string; applied: number }> {
  const userId = await requireUserId()
  const trimmed = input.name.trim().toLowerCase()
  if (!trimmed) throw new Error('Trip name is required')
  if (input.transactionIds.length === 0) {
    throw new Error('No transactions selected')
  }

  const ownedRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        inArray(transactions.id, input.transactionIds),
      ),
    )
  const ownedIds = new Set(ownedRows.map(r => r.id))
  if (ownedIds.size === 0) throw new Error('No matching transactions for current user')

  // Reuse a same-named label if present; create otherwise. Drizzle's onConflict
  // would work here but the lookup-then-insert is small and keeps the embed
  // bookkeeping cleaner (only embed when newly created).
  const [existing] = await db
    .select({ id: tagsTable.id })
    .from(tagsTable)
    .where(
      and(
        eq(tagsTable.userId, userId),
        eq(tagsTable.name, trimmed),
        eq(tagsTable.kind, 'label'),
      ),
    )
    .limit(1)

  let labelId: string
  let createdNew = false
  if (existing) {
    labelId = existing.id
  } else {
    const [created] = await db
      .insert(tagsTable)
      .values({ userId, name: trimmed, kind: 'label' })
      .returning({ id: tagsTable.id })
    if (!created) throw new Error('Failed to create label')
    labelId = created.id
    createdNew = true
  }

  // Insert junction rows; skip ones already linked. Mark as primary only on
  // rows that have no existing primary tag.
  const ids = Array.from(ownedIds)
  const existingTags = await db
    .select({
      transactionId: transactionTags.transactionId,
      tagId: transactionTags.tagId,
      isPrimary: transactionTags.isPrimary,
    })
    .from(transactionTags)
    .where(inArray(transactionTags.transactionId, ids))

  const alreadyHasThisLabel = new Set(
    existingTags.filter(e => e.tagId === labelId).map(e => e.transactionId),
  )
  const hasPrimary = new Set(
    existingTags.filter(e => e.isPrimary).map(e => e.transactionId),
  )

  const toInsert = ids
    .filter(id => !alreadyHasThisLabel.has(id))
    .map(id => ({
      transactionId: id,
      tagId: labelId,
      isPrimary: !hasPrimary.has(id),
    }))

  if (toInsert.length > 0) {
    await db.insert(transactionTags).values(toInsert)
  }

  if (createdNew) {
    // Fire-and-forget; don't block the response on embedding.
    embedTags([labelId]).catch(() => undefined)
  }

  revalidateTag(cacheTag.tags(userId), 'default')
  revalidateTag(cacheTag.tx(userId), 'default')
  revalidatePath('/insights')
  revalidatePath('/transactions')

  return { labelId, applied: toInsert.length }
}

/**
 * Pull the user's "trip" labels — labels where at least one tagged
 * transaction has `is_travel = true`. Used for the Trips card on /insights.
 */
export async function getTripBreakdown(): Promise<TripBreakdownRow[]> {
  const userId = await requireUserId()

  const rows = await db
    .select({
      labelId: tagsTable.id,
      labelName: tagsTable.name,
      labelColor: tagsTable.color,
      amount: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
      count: sql<number>`count(*)::int`,
      startDate: sql<string>`min(${transactions.date})`,
      endDate: sql<string>`max(${transactions.date})`,
    })
    .from(tagsTable)
    .innerJoin(transactionTags, eq(transactionTags.tagId, tagsTable.id))
    .innerJoin(transactions, eq(transactions.id, transactionTags.transactionId))
    .where(
      and(
        eq(tagsTable.userId, userId),
        eq(tagsTable.kind, 'label'),
        eq(transactions.userId, userId),
        eq(transactions.status, 'active'),
        eq(transactions.isExcluded, false),
        eq(transactions.isTravel, true),
      ),
    )
    .groupBy(tagsTable.id, tagsTable.name, tagsTable.color)
    .orderBy(desc(sql`min(${transactions.date})`))

  return rows.map(r => ({
    labelId: r.labelId,
    labelName: r.labelName,
    labelColor: r.labelColor,
    amount: Number(r.amount),
    count: r.count,
    startDate: r.startDate,
    endDate: r.endDate,
  }))
}

function deterministicName(cluster: TripCluster): string {
  const start = formatShortDate(cluster.startDate)
  const end = formatShortDate(cluster.endDate)
  if (start === end) return `trip · ${start}`
  return `trip · ${start}-${end}`
}

function formatShortDate(iso: string): string {
  // Cheap, locale-stable format: "aug 14, 2025"
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

function distinctMerchants(cluster: TripCluster, limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of cluster.rows) {
    const key = r.description.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r.description)
    if (out.length >= limit) break
  }
  return out
}
