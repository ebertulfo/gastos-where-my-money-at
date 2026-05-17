import { and, asc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { transactions, transactionTags, statements as statementsTable } from '@/db/schema'

const DEFAULT_GAP_DAYS = 4
const DEFAULT_MIN_ROWS = 3

export interface ClusterRow {
  id: string
  date: string
  description: string
  amount: number
  statementId: string
  currency: string | null
}

export interface TripCluster {
  /** Stable id for client-side bookkeeping (UUID-shaped string from crypto.randomUUID). */
  clusterId: string
  rows: ClusterRow[]
  /** Earliest row date (YYYY-MM-DD). */
  startDate: string
  /** Latest row date (YYYY-MM-DD). */
  endDate: string
  /** Sum of transaction amounts. */
  totalAmount: number
  /** Distinct currency codes seen across the cluster's statements. */
  currencies: string[]
}

interface DetectOptions {
  /** Skip rows already linked to a label (kind='label'). Default: true. */
  excludeAlreadyLabeled?: boolean
  /** Max gap in days between consecutive rows in a cluster. Default: 4. */
  maxGapDays?: number
  /** Minimum rows for a cluster to surface. Default: 3. */
  minClusterSize?: number
}

/**
 * Group a user's `is_travel = true` rows into time-clusters by date proximity.
 * The intent: a contiguous run of foreign-currency or travel-flagged spend
 * almost always corresponds to a single trip, and the whole run wants the
 * same label ("Bali · Aug 14–21, 2025"). Currency mixing is allowed inside a
 * cluster (Tokyo→Seoul on the same trip is one cluster, two currencies).
 *
 * Pure walk over date-sorted rows: start a new cluster whenever the gap
 * exceeds `maxGapDays`. Drops clusters with fewer than `minClusterSize` rows
 * since one stray foreign-amount transaction is rarely a "trip."
 */
export async function detectTripClusters(
  userId: string,
  options: DetectOptions = {},
): Promise<TripCluster[]> {
  const excludeAlreadyLabeled = options.excludeAlreadyLabeled ?? true
  const maxGapDays = options.maxGapDays ?? DEFAULT_GAP_DAYS
  const minClusterSize = options.minClusterSize ?? DEFAULT_MIN_ROWS

  const baseWhere = and(
    eq(transactions.userId, userId),
    eq(transactions.status, 'active'),
    eq(transactions.isTravel, true),
  )

  // Optional anti-join: skip rows that already carry any label so the
  // user doesn't see clusters they've already named.
  const where = excludeAlreadyLabeled
    ? and(
        baseWhere,
        sql`not exists (select 1 from ${transactionTags} tt where tt.transaction_id = ${transactions.id})`,
      )
    : baseWhere

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      statementId: transactions.statementId,
      currency: statementsTable.currency,
    })
    .from(transactions)
    .leftJoin(statementsTable, eq(statementsTable.id, transactions.statementId))
    .where(where)
    .orderBy(asc(transactions.date), asc(transactions.id))

  if (rows.length === 0) return []

  const clusters: TripCluster[] = []
  let current: ClusterRow[] = []
  let prevTime: number | null = null

  const flush = () => {
    if (current.length >= minClusterSize) {
      clusters.push(buildCluster(current))
    }
    current = []
  }

  for (const r of rows) {
    const t = Date.parse(r.date)
    if (Number.isNaN(t)) continue

    if (prevTime !== null) {
      const gapDays = (t - prevTime) / (1000 * 60 * 60 * 24)
      if (gapDays > maxGapDays) flush()
    }
    current.push({
      id: r.id,
      date: r.date,
      description: r.description,
      amount: Number(r.amount),
      statementId: r.statementId,
      currency: r.currency,
    })
    prevTime = t
  }
  flush()

  return clusters
}

function buildCluster(rows: ClusterRow[]): TripCluster {
  const currencies = Array.from(
    new Set(rows.map(r => r.currency).filter((c): c is string => Boolean(c))),
  )
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  return {
    clusterId: crypto.randomUUID(),
    rows,
    startDate: rows[0].date,
    endDate: rows[rows.length - 1].date,
    totalAmount,
    currencies,
  }
}

// Re-exported for callers that just want to count without re-querying. Keeps
// the un-clustered query in one place.
export async function countUnlabeledTravelRows(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.status, 'active'),
        eq(transactions.isTravel, true),
        sql`not exists (select 1 from ${transactionTags} tt where tt.transaction_id = ${transactions.id})`,
      ),
    )
  return row?.n ?? 0
}

// Helper kept exported for tests / future use. Avoids re-implementing the
// gap walk if a caller already has rows in hand.
export function clusterByDateProximity(
  rows: ClusterRow[],
  options: { maxGapDays?: number; minClusterSize?: number } = {},
): TripCluster[] {
  const maxGapDays = options.maxGapDays ?? DEFAULT_GAP_DAYS
  const minClusterSize = options.minClusterSize ?? DEFAULT_MIN_ROWS
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const clusters: TripCluster[] = []
  let current: ClusterRow[] = []
  let prevTime: number | null = null

  for (const r of sorted) {
    const t = Date.parse(r.date)
    if (Number.isNaN(t)) continue
    if (prevTime !== null) {
      const gapDays = (t - prevTime) / (1000 * 60 * 60 * 24)
      if (gapDays > maxGapDays) {
        if (current.length >= minClusterSize) clusters.push(buildCluster(current))
        current = []
      }
    }
    current.push(r)
    prevTime = t
  }
  if (current.length >= minClusterSize) clusters.push(buildCluster(current))
  return clusters
}
