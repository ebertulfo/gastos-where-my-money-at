'use server'

import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  statements as statementsTable,
  tags as tagsTable,
  transactionImports,
  transactions as transactionsTable,
  type Statement,
  type TransactionImport,
} from '@/db/schema'
import { requireUserId } from '@/lib/auth'
import {
  ImportReview,
  DuplicatePair,
  ImportDecisions,
  StatementReconciliation,
  Transaction,
  Statement as UIStatement,
} from '@/lib/types/transaction'
import { humanizeBankSlug } from '@/lib/utils'
import { tag } from '@/lib/cache/tags'

function mapStatementToUI(s: Statement, transactionCount = 0): UIStatement {
  return {
    id: s.id,
    bankName: humanizeBankSlug(s.bank),
    bankRaw: s.bank,
    statementType: s.statementType as UIStatement['statementType'],
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    currency: s.currency || 'SGD',
    previousBalance: s.previousBalance !== null ? Number(s.previousBalance) : null,
    transactionCount,
    status: (s.status === 'ingesting' || s.status === 'parsed')
      ? 'reviewing'
      : (s.status as UIStatement['status']),
    fileHash: s.sourceFileSha256,
    createdAt: s.createdAt.toISOString(),
  }
}

const STATEMENT_REVALIDATE_PATHS = ['/statements', '/upload', '/transactions', '/insights'] as const

function revalidateStatementSurfaces(userId?: string) {
  for (const path of STATEMENT_REVALIDATE_PATHS) revalidatePath(path)
  if (userId) {
    revalidateTag(tag.statements(userId), 'default')
    revalidateTag(tag.tx(userId), 'default')
  }
}

function mapImportToTransaction(
  imp: TransactionImport,
  currency: string,
  categoryById: Map<string, { id: string; name: string; color: string | null; parent_name: string | null }>,
): Transaction {
  const cat = imp.categoryId ? categoryById.get(imp.categoryId) : null
  return {
    id: imp.id,
    date: imp.date,
    description: imp.description,
    amount: Number(imp.amount),
    currency,
    source: 'Current Upload',
    monthBucket: imp.monthBucket,
    transactionIdentifier: imp.transactionIdentifier,
    statementId: imp.statementId,
    isExcluded: imp.isExcluded ?? false,
    exclusionReason: imp.exclusionReason ?? undefined,
    category: cat
      ? { id: cat.id, name: cat.name, parentName: cat.parent_name, color: cat.color }
      : null,
    categorySource: (imp.categorySource as 'user' | 'ai' | null) ?? null,
    isTravel: Boolean(imp.isTravel),
    tags: [],
    createdAt: imp.createdAt.toISOString(),
  }
}

async function getCountsForStatementIds(
  statementIds: string[],
): Promise<Map<string, { txCount: number; importCount: number }>> {
  const result = new Map<string, { txCount: number; importCount: number }>()
  if (statementIds.length === 0) return result

  const txCounts = await db
    .select({
      statementId: transactionsTable.statementId,
      count: sql<number>`count(*)::int`,
    })
    .from(transactionsTable)
    .where(inArray(transactionsTable.statementId, statementIds))
    .groupBy(transactionsTable.statementId)

  const importCounts = await db
    .select({
      statementId: transactionImports.statementId,
      count: sql<number>`count(*)::int`,
    })
    .from(transactionImports)
    .where(inArray(transactionImports.statementId, statementIds))
    .groupBy(transactionImports.statementId)

  for (const id of statementIds) result.set(id, { txCount: 0, importCount: 0 })
  for (const r of txCounts) {
    const existing = result.get(r.statementId) ?? { txCount: 0, importCount: 0 }
    existing.txCount = Number(r.count)
    result.set(r.statementId, existing)
  }
  for (const r of importCounts) {
    const existing = result.get(r.statementId) ?? { txCount: 0, importCount: 0 }
    existing.importCount = Number(r.count)
    result.set(r.statementId, existing)
  }
  return result
}

export async function getReviewData(statementId: string): Promise<ImportReview> {
  await requireUserId()

  const [statement] = await db
    .select()
    .from(statementsTable)
    .where(eq(statementsTable.id, statementId))
    .limit(1)
  if (!statement) throw new Error('Statement not found')

  const imports = await db
    .select()
    .from(transactionImports)
    .where(
      and(
        eq(transactionImports.statementId, statementId),
        eq(transactionImports.resolution, 'pending'),
      ),
    )
    .orderBy(desc(transactionImports.date), asc(transactionImports.createdAt))

  // Resolve category names for AI- and user-applied categories.
  const categoryIds = Array.from(
    new Set(imports.map(i => i.categoryId).filter((id): id is string => Boolean(id))),
  )
  const categoryById = new Map<
    string,
    { id: string; name: string; color: string | null; parent_name: string | null }
  >()
  if (categoryIds.length > 0) {
    const cats = await db
      .select({
        id: tagsTable.id,
        name: tagsTable.name,
        color: tagsTable.color,
        parentId: tagsTable.parentId,
      })
      .from(tagsTable)
      .where(inArray(tagsTable.id, categoryIds))

    const parentIds = Array.from(
      new Set(cats.map(c => c.parentId).filter((id): id is string => Boolean(id))),
    )
    let parentMap = new Map<string, string>()
    if (parentIds.length > 0) {
      const parents = await db
        .select({ id: tagsTable.id, name: tagsTable.name })
        .from(tagsTable)
        .where(inArray(tagsTable.id, parentIds))
      parentMap = new Map(parents.map(p => [p.id, p.name]))
    }

    for (const c of cats) {
      categoryById.set(c.id, {
        id: c.id,
        name: c.name,
        color: c.color,
        parent_name: c.parentId ? parentMap.get(c.parentId) ?? null : null,
      })
    }
  }

  const newImports = imports.filter(i => !i.existingTransactionId)
  const duplicates: DuplicatePair[] = []

  const reconciliation = computeReconciliation(statement, imports)

  return {
    statement: mapStatementToUI(statement, imports.length),
    newTransactions: newImports.map(i =>
      mapImportToTransaction(i, statement.currency || 'SGD', categoryById),
    ),
    duplicates,
    reconciliation,
  }
}

const RECONCILIATION_TOLERANCE = 0.5

function computeReconciliation(
  statement: Statement,
  imports: TransactionImport[],
): StatementReconciliation {
  const currency = statement.currency || 'SGD'
  const expectedTotal = statement.expectedTotal ? Number(statement.expectedTotal) : null
  const kind = (statement.expectedTotalKind ?? null) as StatementReconciliation['expectedTotalKind']

  if (expectedTotal === null || kind === null) {
    return {
      status: 'unavailable',
      expectedTotal: null,
      expectedTotalKind: null,
      extractedTotal: null,
      diff: null,
      currency,
    }
  }

  const extractedTotal = imports.reduce((acc, imp) => {
    const amt = Number(imp.amount) || 0
    return acc + (kind === 'bank_withdrawals_abs' ? Math.abs(amt) : amt)
  }, 0)

  const diff = Number((extractedTotal - expectedTotal).toFixed(2))
  const status: StatementReconciliation['status'] =
    Math.abs(diff) <= RECONCILIATION_TOLERANCE ? 'match' : 'mismatch'

  return {
    status,
    expectedTotal,
    expectedTotalKind: kind,
    extractedTotal: Number(extractedTotal.toFixed(2)),
    diff,
    currency,
  }
}

export interface StatementMetadataPatch {
  bank?: string | null
  periodStart?: string
  periodEnd?: string
  currency?: string
  expectedTotal?: number | null
  previousBalance?: number | null
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_RE = /^[A-Z]{3}$/

/**
 * Edits parser-extracted statement metadata. Targets the review screen
 * escape hatch when the parser misreads bank, period, currency, or totals.
 *
 * Out of scope (intentional):
 *   - statementType — changes parser semantics; reupload instead.
 *   - accountLast4 — low value editable.
 *   - period changes don't re-resolve transaction dates; user is warned in UI.
 */
export async function updateStatementMetadata(
  statementId: string,
  patch: StatementMetadataPatch,
): Promise<{ success: true } | { success: false; error: string }> {
  const userId = await requireUserId()

  const [existing] = await db
    .select({ id: statementsTable.id, uploadedBy: statementsTable.uploadedBy })
    .from(statementsTable)
    .where(eq(statementsTable.id, statementId))
    .limit(1)
  if (!existing) return { success: false, error: 'Statement not found' }
  if (existing.uploadedBy !== userId) {
    return { success: false, error: 'Statement not found' }
  }

  const update: Record<string, string | number | null> = {}

  if ('bank' in patch) {
    const raw = (patch.bank ?? '').toString().trim().toLowerCase()
    update.bank = raw.length > 0 ? raw : null
  }
  if (patch.periodStart !== undefined) {
    if (!ISO_DATE_RE.test(patch.periodStart)) {
      return { success: false, error: 'periodStart must be YYYY-MM-DD' }
    }
    update.period_start = patch.periodStart
  }
  if (patch.periodEnd !== undefined) {
    if (!ISO_DATE_RE.test(patch.periodEnd)) {
      return { success: false, error: 'periodEnd must be YYYY-MM-DD' }
    }
    update.period_end = patch.periodEnd
  }
  if (patch.currency !== undefined) {
    const cur = patch.currency.trim().toUpperCase()
    if (!CURRENCY_RE.test(cur)) {
      return { success: false, error: 'currency must be a 3-letter ISO code' }
    }
    update.currency = cur
  }
  if ('expectedTotal' in patch) {
    update.expected_total =
      patch.expectedTotal === null || patch.expectedTotal === undefined
        ? null
        : Number(patch.expectedTotal)
  }
  if ('previousBalance' in patch) {
    update.previous_balance =
      patch.previousBalance === null || patch.previousBalance === undefined
        ? null
        : Number(patch.previousBalance)
  }

  if (
    update.period_start &&
    update.period_end &&
    String(update.period_start) > String(update.period_end)
  ) {
    return { success: false, error: 'periodStart must be on or before periodEnd' }
  }

  if (Object.keys(update).length === 0) return { success: true }

  // Drizzle accepts column-name keys via .set with a typed map; map back to
  // schema field names here so the call lines up with the table definition.
  await db
    .update(statementsTable)
    .set({
      ...(update.bank !== undefined ? { bank: update.bank as string | null } : {}),
      ...(update.period_start !== undefined ? { periodStart: update.period_start as string } : {}),
      ...(update.period_end !== undefined ? { periodEnd: update.period_end as string } : {}),
      ...(update.currency !== undefined ? { currency: update.currency as string } : {}),
      ...('expected_total' in update
        ? {
            expectedTotal:
              update.expected_total === null
                ? null
                : (update.expected_total as number).toFixed(2),
          }
        : {}),
      ...('previous_balance' in update
        ? {
            previousBalance:
              update.previous_balance === null
                ? null
                : (update.previous_balance as number).toFixed(2),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(statementsTable.id, statementId))

  revalidateStatementSurfaces(userId)
  revalidatePath(`/imports/${statementId}/review`)
  revalidatePath(`/statements/${statementId}`)
  return { success: true }
}

export async function confirmStatementImport(
  statementId: string,
  decisions: ImportDecisions['decisions'],
): Promise<{ success: boolean; error?: string; targetMonth?: string }> {
  const userId = await requireUserId()

  const initialImports = await db
    .select()
    .from(transactionImports)
    .where(
      and(
        eq(transactionImports.statementId, statementId),
        eq(transactionImports.resolution, 'pending'),
      ),
    )

  const decisionMap = new Map(decisions.map(d => [d.importId, d.action]))
  const acceptedIds: string[] = []
  const rejectedIds: string[] = []
  for (const imp of initialImports) {
    const action = decisionMap.get(imp.id)
    if (action === 'accept') acceptedIds.push(imp.id)
    else rejectedIds.push(imp.id)
  }

  const [statement] = await db
    .select({
      uploadedBy: statementsTable.uploadedBy,
      periodEnd: statementsTable.periodEnd,
    })
    .from(statementsTable)
    .where(eq(statementsTable.id, statementId))
    .limit(1)
  if (!statement) return { success: false, error: 'Statement not found' }

  let accepted: TransactionImport[] = []
  if (acceptedIds.length > 0) {
    accepted = await db
      .select()
      .from(transactionImports)
      .where(inArray(transactionImports.id, acceptedIds))
  }

  if (accepted.length > 0) {
    const rows = accepted.map(imp => ({
      userId: statement.uploadedBy,
      statementId: imp.statementId,
      transactionIdentifier: imp.transactionIdentifier,
      date: imp.date,
      monthBucket: imp.monthBucket,
      description: imp.description,
      amount: imp.amount,
      balance: imp.balance,
      statementPage: imp.statementPage,
      lineNumber: imp.lineNumber,
      status: 'active' as const,
      isExcluded: imp.isExcluded ?? false,
      exclusionReason: imp.exclusionReason,
      categoryId: imp.categoryId,
      categorySource: imp.categorySource,
      descriptionEmbedding: imp.descriptionEmbedding,
      isTravel: imp.isTravel,
    }))

    try {
      await db
        .insert(transactionsTable)
        .values(rows)
        .onConflictDoNothing({
          target: [transactionsTable.userId, transactionsTable.transactionIdentifier],
        })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      return { success: false, error: `Failed to insert transactions: ${msg}` }
    }
  }

  if (acceptedIds.length > 0) {
    await db
      .update(transactionImports)
      .set({ resolution: 'accepted' })
      .where(inArray(transactionImports.id, acceptedIds))
  }
  if (rejectedIds.length > 0) {
    await db
      .update(transactionImports)
      .set({ resolution: 'rejected' })
      .where(inArray(transactionImports.id, rejectedIds))
  }

  await db
    .update(statementsTable)
    .set({ status: 'ingested' })
    .where(eq(statementsTable.id, statementId))

  revalidateStatementSurfaces(userId)
  revalidatePath(`/statements/${statementId}`)

  // Land on the latest accepted month (fallback: statement period_end).
  const acceptedMonths = initialImports
    .filter(i => decisionMap.get(i.id) === 'accept' || !i.existingTransactionId)
    .map(i => i.monthBucket)
    .filter((m): m is string => Boolean(m))
    .sort()
  const targetMonth =
    acceptedMonths[acceptedMonths.length - 1] ||
    (statement.periodEnd ? statement.periodEnd.slice(0, 7) : undefined)

  return { success: true, targetMonth }
}

export async function getRecentStatements(): Promise<UIStatement[]> {
  const userId = await requireUserId()

  const rows = await db
    .select()
    .from(statementsTable)
    .where(eq(statementsTable.uploadedBy, userId))
    .orderBy(desc(statementsTable.createdAt))
    .limit(10)

  const counts = await getCountsForStatementIds(rows.map(r => r.id))
  return rows.map(s => {
    const c = counts.get(s.id) ?? { txCount: 0, importCount: 0 }
    return mapStatementToUI(s, c.txCount || c.importCount)
  })
}

export async function deleteStatement(statementId: string): Promise<{ success: boolean; error?: string }> {
  const userId = await requireUserId()
  try {
    await db.delete(statementsTable).where(eq(statementsTable.id, statementId))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return { success: false, error: msg }
  }
  revalidateStatementSurfaces(userId)
  revalidatePath(`/statements/${statementId}`)
  return { success: true }
}

export async function getStatements(): Promise<UIStatement[]> {
  const userId = await requireUserId()
  return unstable_cache(
    async () => {
      const rows = await db
        .select()
        .from(statementsTable)
        .where(eq(statementsTable.uploadedBy, userId))
        .orderBy(desc(statementsTable.createdAt))

      const counts = await getCountsForStatementIds(rows.map(r => r.id))
      return rows.map(s => {
        const c = counts.get(s.id) ?? { txCount: 0, importCount: 0 }
        return mapStatementToUI(s, c.txCount || c.importCount)
      })
    },
    ['statements', userId],
    { tags: [tag.statements(userId), tag.tx(userId)], revalidate: 3600 },
  )()
}

export async function getStatementById(id: string): Promise<UIStatement | null> {
  await requireUserId()

  const [s] = await db
    .select()
    .from(statementsTable)
    .where(eq(statementsTable.id, id))
    .limit(1)
  if (!s) return null

  const counts = await getCountsForStatementIds([id])
  const c = counts.get(id) ?? { txCount: 0, importCount: 0 }
  return mapStatementToUI(s, c.txCount || c.importCount)
}

export async function getPendingStatements(): Promise<UIStatement[]> {
  const userId = await requireUserId()

  const rows = await db
    .select()
    .from(statementsTable)
    .where(
      and(
        eq(statementsTable.uploadedBy, userId),
        inArray(statementsTable.status, ['parsed', 'ingesting']),
      ),
    )
    .orderBy(asc(statementsTable.createdAt))

  const counts = await getCountsForStatementIds(rows.map(r => r.id))
  return rows.map(s => {
    const c = counts.get(s.id) ?? { txCount: 0, importCount: 0 }
    return mapStatementToUI(s, c.importCount)
  })
}

export async function saveDuplicateDecision(importId: string, decision: 'accept' | 'reject'): Promise<void> {
  await requireUserId()

  const noteContent = `DRAFT:${decision}`

  const [updated] = await db
    .update(transactionImports)
    .set({ notes: noteContent })
    .where(eq(transactionImports.id, importId))
    .returning({ statementId: transactionImports.statementId })

  if (updated?.statementId) {
    revalidatePath(`/imports/${updated.statementId}/review`)
  }
}
