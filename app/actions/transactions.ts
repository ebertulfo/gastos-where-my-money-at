'use server'

import { revalidatePath, unstable_cache } from 'next/cache'
import { and, asc, desc, eq, gt, inArray, isNull, like, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  householdMembers,
  statementMembers,
  statements as statementsTable,
  tags as tagsTable,
  transactionTags,
  transactions,
} from '@/db/schema'
import { requireUserId, getUserId } from '@/lib/auth'
import { tag } from '@/lib/cache/tags'
import { Transaction, MonthSummary } from '@/lib/types/transaction'
import type {
  Insights,
  InsightsFilters,
  InsightsPeriod,
  MemberBreakdownRow,
  MerchantRow,
  TagBreakdownRow,
} from '@/lib/types/insights'
import { formatDate, humanizeBankSlug } from '@/lib/utils'

interface ResolvedCategory {
  id: string
  name: string
  color: string | null
  parentId: string | null
  parentName: string | null
  parentColor: string | null
}

interface RowWithRelations {
  id: string
  date: string
  description: string
  amount: string
  monthBucket: string
  transactionIdentifier: string
  statementId: string
  isExcluded: boolean | null
  exclusionReason: string | null
  categoryId: string | null
  categorySource: string | null
  isTravel: boolean
  createdAt: Date
  statement: {
    bank: string | null
    periodStart: string
    sourceFileName: string
  } | null
  labelTags: { id: string; name: string; color: string | null }[]
}

function mapTransaction(
  row: RowWithRelations,
  categoryById: Map<string, ResolvedCategory>,
): Transaction {
  const bankName = humanizeBankSlug(row.statement?.bank)
  const period = row.statement?.periodStart
    ? `(${formatDate(row.statement.periodStart).split(' ')[1]} ${formatDate(row.statement.periodStart).split(' ')[2]})`
    : ''
  let sourceLabel = `${bankName} ${period}`.trim()
  if (!row.statement) sourceLabel = 'Usage'

  const resolved = row.categoryId ? categoryById.get(row.categoryId) : null
  const category = resolved
    ? {
        id: resolved.id,
        name: resolved.name,
        parentName: resolved.parentName,
        color: resolved.color,
      }
    : null

  return {
    id: row.id,
    date: row.date,
    description: row.description,
    amount: Number(row.amount),
    currency: 'SGD',
    source: sourceLabel,
    monthBucket: row.monthBucket,
    transactionIdentifier: row.transactionIdentifier,
    statementId: row.statementId,
    isExcluded: row.isExcluded ?? false,
    exclusionReason: row.exclusionReason ?? undefined,
    category,
    categorySource: (row.categorySource as 'user' | 'ai' | null) ?? null,
    isTravel: Boolean(row.isTravel),
    tags: row.labelTags.map(t => ({ id: t.id, name: t.name, color: t.color })),
    createdAt: row.createdAt.toISOString(),
  }
}

async function fetchTxRowsWithRelations(
  userId: string,
  whereClauses: ReturnType<typeof and>[],
): Promise<RowWithRelations[]> {
  const allClauses = [eq(transactions.userId, userId), eq(transactions.status, 'active'), ...whereClauses]
  const flat = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      monthBucket: transactions.monthBucket,
      transactionIdentifier: transactions.transactionIdentifier,
      statementId: transactions.statementId,
      isExcluded: transactions.isExcluded,
      exclusionReason: transactions.exclusionReason,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      isTravel: transactions.isTravel,
      createdAt: transactions.createdAt,
      stmtBank: statementsTable.bank,
      stmtPeriodStart: statementsTable.periodStart,
      stmtSourceFileName: statementsTable.sourceFileName,
    })
    .from(transactions)
    .leftJoin(statementsTable, eq(statementsTable.id, transactions.statementId))
    .where(and(...allClauses))
    .orderBy(desc(transactions.date))

  if (flat.length === 0) return []

  const txIds = flat.map(r => r.id)
  const tagJoinRows = await db
    .select({
      transactionId: transactionTags.transactionId,
      tagId: tagsTable.id,
      tagName: tagsTable.name,
      tagColor: tagsTable.color,
      tagKind: tagsTable.kind,
    })
    .from(transactionTags)
    .innerJoin(tagsTable, eq(tagsTable.id, transactionTags.tagId))
    .where(inArray(transactionTags.transactionId, txIds))

  const labelsByTxId = new Map<string, { id: string; name: string; color: string | null }[]>()
  for (const r of tagJoinRows) {
    if (r.tagKind !== 'label') continue
    const list = labelsByTxId.get(r.transactionId) ?? []
    list.push({ id: r.tagId, name: r.tagName, color: r.tagColor })
    labelsByTxId.set(r.transactionId, list)
  }

  return flat.map<RowWithRelations>(r => ({
    id: r.id,
    date: r.date,
    description: r.description,
    amount: r.amount,
    monthBucket: r.monthBucket,
    transactionIdentifier: r.transactionIdentifier,
    statementId: r.statementId,
    isExcluded: r.isExcluded,
    exclusionReason: r.exclusionReason,
    categoryId: r.categoryId,
    categorySource: r.categorySource,
    isTravel: r.isTravel,
    createdAt: r.createdAt,
    statement: r.stmtPeriodStart
      ? {
          bank: r.stmtBank,
          periodStart: r.stmtPeriodStart,
          sourceFileName: r.stmtSourceFileName ?? '',
        }
      : null,
    labelTags: labelsByTxId.get(r.id) ?? [],
  }))
}

export async function getTransactions(month?: string | null, statementId?: string): Promise<Transaction[]> {
  const userId = await requireUserId()

  const filters: ReturnType<typeof and>[] = []
  if (month) filters.push(eq(transactions.monthBucket, month))
  if (statementId) filters.push(eq(transactions.statementId, statementId))

  const rows = await fetchTxRowsWithRelations(userId, filters)

  const referencedCategoryIds = Array.from(
    new Set(rows.map(r => r.categoryId).filter((id): id is string => Boolean(id))),
  )
  const categoryById = await resolveCategoriesWithParents(referencedCategoryIds)
  return rows.map(r => mapTransaction(r, categoryById))
}

export async function getTransactionsForCategoryRollup(
  rollupCategoryId: string,
  period: InsightsPeriod,
  filters: InsightsFilters = { memberIds: [], travelMode: 'all' },
): Promise<Transaction[]> {
  const userId = await requireUserId()

  const isUncategorized = rollupCategoryId === '__uncategorized__'
  const acceptableCategoryIds: string[] = []
  if (!isUncategorized) {
    acceptableCategoryIds.push(rollupCategoryId)
    const childRows = await db
      .select({ id: tagsTable.id })
      .from(tagsTable)
      .where(and(eq(tagsTable.userId, userId), eq(tagsTable.parentId, rollupCategoryId)))
    for (const r of childRows) acceptableCategoryIds.push(r.id)
  }

  let allowedStatementIds: Set<string> | null = null
  if (filters.memberIds.length > 0) {
    const smRows = await db
      .select({ statementId: statementMembers.statementId })
      .from(statementMembers)
      .where(inArray(statementMembers.memberId, filters.memberIds))
    allowedStatementIds = new Set(smRows.map(r => r.statementId))
    if (allowedStatementIds.size === 0) return []
  }

  const where: ReturnType<typeof and>[] = []
  if (period.type === 'statement') where.push(eq(transactions.statementId, period.statementId))
  else if (period.type === 'month') where.push(eq(transactions.monthBucket, period.month))
  else where.push(like(transactions.monthBucket, `${period.year}-%`))

  if (allowedStatementIds) where.push(inArray(transactions.statementId, Array.from(allowedStatementIds)))
  if (filters.travelMode === 'travel') where.push(eq(transactions.isTravel, true))
  else if (filters.travelMode === 'no-travel') where.push(eq(transactions.isTravel, false))

  if (isUncategorized) where.push(isNull(transactions.categoryId))
  else where.push(inArray(transactions.categoryId, acceptableCategoryIds))

  const rows = await fetchTxRowsWithRelations(userId, where)
  const referencedIds = Array.from(
    new Set(rows.map(r => r.categoryId).filter((id): id is string => Boolean(id))),
  )
  const categoryById = await resolveCategoriesWithParents(referencedIds)
  return rows.map(r => mapTransaction(r, categoryById))
}

export async function getAvailableMonthsList(): Promise<string[]> {
  const userId = await requireUserId()
  return unstable_cache(
    async () => {
      const rows = await db
        .selectDistinct({ monthBucket: transactions.monthBucket })
        .from(transactions)
        .where(eq(transactions.userId, userId))

      return rows
        .map(r => r.monthBucket)
        .filter((m): m is string => Boolean(m))
        .sort()
        .reverse()
    },
    ['available-months', userId],
    { tags: [tag.tx(userId)], revalidate: 3600 },
  )()
}

export async function getMonthSummary(month: string | null, statementId?: string): Promise<MonthSummary> {
  const userId = await requireUserId()

  const where: ReturnType<typeof and>[] = [
    eq(transactions.userId, userId),
    eq(transactions.status, 'active'),
  ]
  if (month) where.push(eq(transactions.monthBucket, month))
  if (statementId) where.push(eq(transactions.statementId, statementId))

  const rows = await db
    .select({
      amount: transactions.amount,
      statementId: transactions.statementId,
      isExcluded: transactions.isExcluded,
    })
    .from(transactions)
    .where(and(...where))

  const totalSpent = rows
    .filter(t => Number(t.amount) > 0 && !t.isExcluded)
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const statementCount = new Set(rows.map(t => t.statementId)).size

  return {
    month: month || 'All',
    totalSpent,
    transactionCount: rows.length,
    statementCount,
    currency: 'SGD',
  }
}

/**
 * User-toggleable travel flag. Tries the confirmed `transactions` table first;
 * falls back to staging `transaction_imports`.
 */
export async function setTransactionTravel(id: string, isTravel: boolean) {
  await requireUserId()

  const updatedTx = await db
    .update(transactions)
    .set({ isTravel })
    .where(eq(transactions.id, id))
    .returning({ id: transactions.id })

  if (updatedTx.length > 0) {
    revalidateExclusionSurfaces()
    return { success: true }
  }

  await db.execute(
    sql`update transaction_imports set is_travel = ${isTravel} where id = ${id}`,
  )
  revalidateExclusionSurfaces()
  return { success: true }
}

export async function updateTransactionExclusion(id: string, isExcluded: boolean, reason?: string) {
  await requireUserId()

  const updatedTx = await db
    .update(transactions)
    .set({ isExcluded, exclusionReason: isExcluded ? (reason ?? null) : null })
    .where(eq(transactions.id, id))
    .returning({ id: transactions.id })

  if (updatedTx.length > 0) {
    revalidateExclusionSurfaces()
    return { success: true }
  }

  await db.execute(
    sql`update transaction_imports
        set is_excluded = ${isExcluded},
            exclusion_reason = ${isExcluded ? (reason ?? null) : null}
        where id = ${id}`,
  )
  revalidateExclusionSurfaces()
  return { success: true }
}

function revalidateExclusionSurfaces() {
  revalidatePath('/transactions')
  revalidatePath('/insights')
  revalidatePath('/statements/[id]', 'page')
  revalidatePath('/imports/[statementId]/review', 'page')
}

// ---------- Find-similar (#9) ----------

export interface SimilarTransactionRow {
  id: string
  description: string
  amount: number
  date: string
  statementId: string
  categoryId: string | null
  categorySource: 'user' | 'ai' | null
  isExcluded: boolean
  similarity: number
  source: string
}

interface FindSimilarRpcRow {
  id: string
  description: string
  amount: string
  date: string
  statement_id: string
  category_id: string | null
  category_source: 'user' | 'ai' | null
  is_excluded: boolean
  similarity: number
}

export async function findSimilarTransactions(
  targetId: string,
  options: { minSimilarity?: number; limit?: number } = {},
): Promise<SimilarTransactionRow[]> {
  await requireUserId()
  const userId = await requireUserId()

  const minSimilarity = options.minSimilarity ?? 0.6
  const limit = options.limit ?? 25

  let rows: FindSimilarRpcRow[] = []
  try {
    const result = await db.execute(
      sql`select * from find_similar_transactions(${userId}, ${targetId}::uuid, ${minSimilarity}, ${limit})`,
    )
    rows = ((result as unknown as { rows?: FindSimilarRpcRow[] }).rows
      ?? (result as unknown as FindSimilarRpcRow[]))
  } catch (err) {
    console.warn('findSimilarTransactions RPC failed', err)
    return []
  }

  if (rows.length === 0) return []

  const statementIds = Array.from(new Set(rows.map(r => r.statement_id)))
  const stmtRows = await db
    .select({
      id: statementsTable.id,
      bank: statementsTable.bank,
      periodStart: statementsTable.periodStart,
    })
    .from(statementsTable)
    .where(inArray(statementsTable.id, statementIds))

  const sourceById = new Map<string, string>()
  for (const s of stmtRows) {
    const bankName = humanizeBankSlug(s.bank)
    const period = s.periodStart
      ? `(${formatDate(s.periodStart).split(' ')[1]} ${formatDate(s.periodStart).split(' ')[2]})`
      : ''
    sourceById.set(s.id, `${bankName} ${period}`.trim())
  }

  return rows.map(r => ({
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    date: r.date,
    statementId: r.statement_id,
    categoryId: r.category_id,
    categorySource: r.category_source,
    isExcluded: r.is_excluded,
    similarity: r.similarity,
    source: sourceById.get(r.statement_id) ?? '',
  }))
}

export async function bulkApplyCategory(
  transactionIds: string[],
  categoryId: string | null,
): Promise<{ updated: number }> {
  const userId = await requireUserId()
  if (transactionIds.length === 0) return { updated: 0 }

  const result = await db
    .update(transactions)
    .set({
      categoryId,
      categorySource: categoryId ? 'user' : null,
    })
    .where(and(eq(transactions.userId, userId), inArray(transactions.id, transactionIds)))
    .returning({ id: transactions.id })

  revalidatePath('/transactions')
  revalidatePath('/insights')
  return { updated: result.length }
}

export async function bulkApplyLabel(
  transactionIds: string[],
  tagId: string,
): Promise<{ updated: number }> {
  const userId = await requireUserId()
  if (transactionIds.length === 0) return { updated: 0 }

  const ownedRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.id, transactionIds)))
  const ownedIds = ownedRows.map(r => r.id)
  if (ownedIds.length === 0) return { updated: 0 }

  // Dedup: skip rows already tagged with this label.
  const existing = await db
    .select({ transactionId: transactionTags.transactionId })
    .from(transactionTags)
    .where(
      and(
        eq(transactionTags.tagId, tagId),
        inArray(transactionTags.transactionId, ownedIds),
      ),
    )
  const skip = new Set(existing.map(e => e.transactionId))

  // For rows that already have any primary tag, the new one is non-primary;
  // for rows with no tags, it becomes primary. Cheaper than re-checking each:
  // look up which ownedIds currently have any primary tag.
  const haveAny = await db
    .select({ transactionId: transactionTags.transactionId })
    .from(transactionTags)
    .where(inArray(transactionTags.transactionId, ownedIds))
  const hasExistingTag = new Set(haveAny.map(r => r.transactionId))

  const toInsert = ownedIds
    .filter(id => !skip.has(id))
    .map(id => ({
      transactionId: id,
      tagId,
      isPrimary: !hasExistingTag.has(id),
    }))

  if (toInsert.length === 0) return { updated: 0 }

  await db.insert(transactionTags).values(toInsert)

  revalidatePath('/transactions')
  revalidatePath('/insights')
  return { updated: toInsert.length }
}

export async function bulkSetExcluded(
  transactionIds: string[],
  isExcluded: boolean,
  reason?: string,
): Promise<{ updated: number }> {
  const userId = await requireUserId()
  if (transactionIds.length === 0) return { updated: 0 }

  const result = await db
    .update(transactions)
    .set({
      isExcluded,
      exclusionReason: isExcluded ? (reason ?? null) : null,
    })
    .where(and(eq(transactions.userId, userId), inArray(transactions.id, transactionIds)))
    .returning({ id: transactions.id })

  revalidateExclusionSurfaces()
  return { updated: result.length }
}

export async function getStatementsForMonth(month: string): Promise<{ id: string; label: string }[]> {
  const userId = await requireUserId()
  return unstable_cache(
    async () => {
      const rows = await db
        .select({
          statementId: transactions.statementId,
          stmtBank: statementsTable.bank,
          stmtPeriodStart: statementsTable.periodStart,
          stmtSourceFileName: statementsTable.sourceFileName,
        })
        .from(transactions)
        .innerJoin(statementsTable, eq(statementsTable.id, transactions.statementId))
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.status, 'active'),
            eq(transactions.monthBucket, month),
          ),
        )

      const unique = new Map<string, string>()
      for (const r of rows) {
        if (!r.statementId) continue
        const bank = humanizeBankSlug(r.stmtBank)
        const period = r.stmtPeriodStart
          ? `(${formatDate(r.stmtPeriodStart).split(' ')[1]} ${formatDate(r.stmtPeriodStart).split(' ')[2]})`
          : ''
        unique.set(r.statementId, `${bank} ${period}`.trim())
      }
      return Array.from(unique.entries()).map(([id, label]) => ({ id, label }))
    },
    ['statements-for-month', userId, month],
    { tags: [tag.tx(userId), tag.statements(userId)], revalidate: 3600 },
  )()
}

export async function getYearsWithDataList(): Promise<string[]> {
  const userId = await requireUserId()
  return unstable_cache(
    async () => {
      const rows = await db
        .selectDistinct({ monthBucket: transactions.monthBucket })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.status, 'active')))

      const years = new Set<string>()
      for (const row of rows) {
        if (row.monthBucket && row.monthBucket.length >= 4) {
          years.add(row.monthBucket.slice(0, 4))
        }
      }
      return Array.from(years).sort().reverse()
    },
    ['years-with-data', userId],
    { tags: [tag.tx(userId)], revalidate: 3600 },
  )()
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatPeriodLabel(period: InsightsPeriod, statementLabelById: Map<string, string>): string {
  if (period.type === 'statement') {
    return statementLabelById.get(period.statementId) || 'Statement'
  }
  if (period.type === 'year') return period.year
  const [year, month] = period.month.split('-')
  const idx = parseInt(month, 10) - 1
  return `${MONTH_NAMES[idx] || month} ${year}`
}

interface InsightsTxRow {
  amount: number
  description: string
  statementId: string
  categoryId: string | null
  categorySource: 'user' | 'ai' | null
  isTravel: boolean
  currency: string | null
}

export async function getInsights(
  period: InsightsPeriod,
  filters: InsightsFilters = { memberIds: [], travelMode: 'all' },
): Promise<Insights> {
  const userId = await requireUserId()

  let allowedStatementIds: Set<string> | null = null
  if (filters.memberIds.length > 0) {
    const smRows = await db
      .select({ statementId: statementMembers.statementId })
      .from(statementMembers)
      .where(inArray(statementMembers.memberId, filters.memberIds))
    allowedStatementIds = new Set(smRows.map(r => r.statementId))
    if (allowedStatementIds.size === 0) return emptyInsights(period)
  }

  const where: ReturnType<typeof and>[] = [
    eq(transactions.userId, userId),
    eq(transactions.status, 'active'),
    eq(transactions.isExcluded, false),
    gt(transactions.amount, '0'),
  ]
  if (allowedStatementIds) where.push(inArray(transactions.statementId, Array.from(allowedStatementIds)))
  if (filters.travelMode === 'travel') where.push(eq(transactions.isTravel, true))
  else if (filters.travelMode === 'no-travel') where.push(eq(transactions.isTravel, false))

  if (period.type === 'statement') where.push(eq(transactions.statementId, period.statementId))
  else if (period.type === 'month') where.push(eq(transactions.monthBucket, period.month))
  else where.push(like(transactions.monthBucket, `${period.year}-%`))

  const dataRows = await db
    .select({
      amount: transactions.amount,
      description: transactions.description,
      statementId: transactions.statementId,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      isTravel: transactions.isTravel,
      currency: statementsTable.currency,
    })
    .from(transactions)
    .leftJoin(statementsTable, eq(statementsTable.id, transactions.statementId))
    .where(and(...where))

  const statementLabelById = new Map<string, string>()
  if (period.type === 'statement') {
    const [stmt] = await db
      .select({ id: statementsTable.id, bank: statementsTable.bank, periodStart: statementsTable.periodStart })
      .from(statementsTable)
      .where(eq(statementsTable.id, period.statementId))
      .limit(1)
    if (stmt) {
      statementLabelById.set(stmt.id, `${humanizeBankSlug(stmt.bank)} (${stmt.periodStart.slice(0, 7)})`)
    }
  }

  if (dataRows.length === 0) return emptyInsights(period, formatPeriodLabel(period, statementLabelById))

  const rows: InsightsTxRow[] = dataRows.map(r => ({
    amount: Number(r.amount),
    description: r.description,
    statementId: r.statementId,
    categoryId: r.categoryId,
    categorySource: r.categorySource as 'user' | 'ai' | null,
    isTravel: r.isTravel,
    currency: r.currency,
  }))

  const referencedCategoryIds = Array.from(
    new Set(rows.map(r => r.categoryId).filter((id): id is string => Boolean(id))),
  )
  const categoryById = await resolveCategoriesWithParents(referencedCategoryIds)

  const categoryAggregates = new Map<string, { tagName: string; tagColor: string | null; amount: number; count: number }>()
  const merchantAggregates = new Map<string, { amount: number; count: number }>()
  const statementIds = new Set<string>()
  let totalSpent = 0
  let aiCategorizedCount = 0
  let categorizedCount = 0
  let travelSpent = 0
  let travelTransactionCount = 0
  const UNCATEGORIZED_KEY = '__uncategorized__'
  let currency = 'SGD'

  for (const row of rows) {
    totalSpent += row.amount
    statementIds.add(row.statementId)
    if (row.currency) currency = row.currency
    if (row.categoryId) {
      categorizedCount += 1
      if (row.categorySource === 'ai') aiCategorizedCount += 1
    }
    if (row.isTravel) {
      travelSpent += row.amount
      travelTransactionCount += 1
    }

    const cat = row.categoryId ? categoryById.get(row.categoryId) : null
    const rollupId = cat?.parentId ?? cat?.id ?? UNCATEGORIZED_KEY
    const rollupName = cat?.parentName ?? cat?.name ?? 'Uncategorized'
    const rollupColor = cat?.parentColor ?? cat?.color ?? null
    const existing = categoryAggregates.get(rollupId)
    if (existing) {
      existing.amount += row.amount
      existing.count += 1
    } else {
      categoryAggregates.set(rollupId, {
        tagName: rollupName,
        tagColor: rollupColor,
        amount: row.amount,
        count: 1,
      })
    }

    const merchKey = normalizeMerchantKey(row.description)
    const m = merchantAggregates.get(merchKey)
    if (m) {
      m.amount += row.amount
      m.count += 1
    } else {
      merchantAggregates.set(merchKey, { amount: row.amount, count: 1 })
    }
  }

  const tagBreakdown: TagBreakdownRow[] = Array.from(categoryAggregates.entries())
    .map(([id, a]) => ({
      tagId: id === UNCATEGORIZED_KEY ? null : id,
      tagName: a.tagName,
      tagColor: a.tagColor,
      amount: a.amount,
      percentage: totalSpent > 0 ? (a.amount / totalSpent) * 100 : 0,
      count: a.count,
    }))
    .sort((a, b) => b.amount - a.amount)

  const topMerchants: MerchantRow[] = Array.from(merchantAggregates.entries())
    .map(([description, a]) => ({ description, amount: a.amount, count: a.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

  const memberBreakdown = await computeMemberBreakdown(Array.from(statementIds), rows)

  return {
    periodLabel: formatPeriodLabel(period, statementLabelById),
    currency,
    totalSpent,
    transactionCount: rows.length,
    statementCount: statementIds.size,
    tagBreakdown,
    topMerchants,
    memberBreakdown,
    aiCategorizedCount,
    categorizedCount,
    travelSpent,
    travelTransactionCount,
  }
}

async function resolveCategoriesWithParents(
  categoryIds: string[],
): Promise<Map<string, ResolvedCategory>> {
  const out = new Map<string, ResolvedCategory>()
  if (categoryIds.length === 0) return out

  const direct = await db
    .select({
      id: tagsTable.id,
      name: tagsTable.name,
      color: tagsTable.color,
      parentId: tagsTable.parentId,
    })
    .from(tagsTable)
    .where(inArray(tagsTable.id, categoryIds))

  const parentsToFetch = new Set<string>()
  for (const r of direct) {
    if (r.parentId) parentsToFetch.add(r.parentId)
  }

  let parentMap = new Map<string, { name: string; color: string | null }>()
  if (parentsToFetch.size > 0) {
    const parentRows = await db
      .select({
        id: tagsTable.id,
        name: tagsTable.name,
        color: tagsTable.color,
      })
      .from(tagsTable)
      .where(inArray(tagsTable.id, Array.from(parentsToFetch)))
    parentMap = new Map(parentRows.map(p => [p.id, { name: p.name, color: p.color }]))
  }

  for (const r of direct) {
    const parent = r.parentId ? parentMap.get(r.parentId) : null
    out.set(r.id, {
      id: r.id,
      name: r.name,
      color: r.color,
      parentId: r.parentId,
      parentName: parent?.name ?? null,
      parentColor: parent?.color ?? null,
    })
  }
  return out
}

const MERCHANT_CURRENCY_TOKENS =
  '(?:YEN|JPY|USD|EUR|EURO|GBP|POUND|HKD|KRW|WON|CNY|YUAN|RMB|TWD|AUD|NZD|CAD|CHF|SGD|IDR|MYR|THB|PHP|VND|INR|MXN)'

const REDACTION_PLACEHOLDER_RE = /<[a-z_]+_redacted>/gi
const TRAILING_AMOUNT_WITH_COUNTRY_RE = new RegExp(
  `\\s+[A-Z]{2}\\s+${MERCHANT_CURRENCY_TOKENS}\\s+[\\d.,]+\\s*$`,
  'i',
)
const TRAILING_AMOUNT_RE = new RegExp(
  `\\s+${MERCHANT_CURRENCY_TOKENS}\\s+[\\d.,]+\\s*$`,
  'i',
)
const TRAILING_NUMERIC_REF_RE = /\s+[\d-]{4,}\s*$/g
const TRAILING_PAREN_CODE_RE = /\s+\(\d+\)\s*$/

function normalizeMerchantKey(description: string): string {
  let out = description.toUpperCase().trim()
  out = out.replace(REDACTION_PLACEHOLDER_RE, '')
  const asterIdx = out.indexOf('*')
  if (asterIdx > 0) out = out.slice(0, asterIdx).trim()
  out = out.replace(TRAILING_AMOUNT_WITH_COUNTRY_RE, '')
  out = out.replace(TRAILING_AMOUNT_RE, '')
  out = out.replace(TRAILING_NUMERIC_REF_RE, '')
  out = out.replace(TRAILING_PAREN_CODE_RE, '')
  out = out.replace(/\s+/g, ' ').trim()
  return out
}

function emptyInsights(period: InsightsPeriod, periodLabel?: string): Insights {
  return {
    periodLabel: periodLabel ?? '',
    currency: 'SGD',
    totalSpent: 0,
    transactionCount: 0,
    statementCount: 0,
    tagBreakdown: [],
    topMerchants: [],
    memberBreakdown: [],
    aiCategorizedCount: 0,
    categorizedCount: 0,
    travelSpent: 0,
    travelTransactionCount: 0,
  }
}

async function computeMemberBreakdown(
  statementIds: string[],
  rows: InsightsTxRow[],
): Promise<MemberBreakdownRow[]> {
  if (statementIds.length === 0 || rows.length === 0) return []

  const memberRows = await db
    .select({
      statementId: statementMembers.statementId,
      memberId: householdMembers.id,
      memberName: householdMembers.name,
      memberColor: householdMembers.color,
    })
    .from(statementMembers)
    .innerJoin(householdMembers, eq(householdMembers.id, statementMembers.memberId))
    .where(inArray(statementMembers.statementId, statementIds))

  const membersByStatement = new Map<string, { id: string; name: string; color: string | null }[]>()
  for (const r of memberRows) {
    const list = membersByStatement.get(r.statementId) ?? []
    list.push({ id: r.memberId, name: r.memberName, color: r.memberColor })
    membersByStatement.set(r.statementId, list)
  }

  const aggregate = new Map<string, MemberBreakdownRow>()
  for (const row of rows) {
    const members = membersByStatement.get(row.statementId) ?? []
    if (members.length === 0) continue
    const isJoint = members.length >= 2
    for (const m of members) {
      const existing = aggregate.get(m.id)
      if (existing) {
        existing.amount += row.amount
        existing.count += 1
        if (isJoint) existing.jointAmount += row.amount
      } else {
        aggregate.set(m.id, {
          memberId: m.id,
          memberName: m.name,
          memberColor: m.color,
          amount: row.amount,
          count: 1,
          jointAmount: isJoint ? row.amount : 0,
        })
      }
    }
  }

  return Array.from(aggregate.values()).sort((a, b) => b.amount - a.amount)
}
