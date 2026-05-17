import { createHash } from 'crypto'
import { revalidateTag } from 'next/cache'
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/lib/db'
import { tag } from '@/lib/cache/tags'
import {
  statements,
  statementMembers,
  transactionImports,
  transactions,
} from '@/db/schema'
import {
  generateTransactionIdentifier,
  normalizeDateToYyyyMmDd,
} from '@/lib/transaction-identifier'
import {
  autoApplyCategoriesBatch,
  llmFallbackForUncategorizedImports,
} from '@/lib/suggest/auto-apply'

type StatementTypeValue = 'debit' | 'credit' | 'investment'

type TransactionRow = {
  date: string
  description: string
  amount: number
  balance?: number
}

interface IngestOptions {
  fileName: string
  fileBuffer: Buffer
  rows: TransactionRow[]
  metadata: {
    periodStart?: string
    periodEnd?: string
    bank?: string
    statementType?: StatementTypeValue
    accountLast4?: string
    currency?: string
    expectedTotal?: number | null
    expectedTotalKind?: 'cc_new_charges_signed' | 'bank_withdrawals_abs' | null
    previousBalance?: number | null
    memberIds?: string[]
  }
  userId: string
}

const BANK_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/dbs[\s_-]*posb/i, 'dbs_posb'],
  [/standard[\s_-]*chartered|stan[\s_-]*chart/i, 'stanchart'],
  [/maybank/i, 'maybank'],
  [/citi(bank)?/i, 'citi'],
  [/hsbc/i, 'hsbc'],
  [/posb/i, 'posb'],
  [/ocbc/i, 'ocbc'],
  [/uob/i, 'uob'],
  [/dbs/i, 'dbs'],
]

function detectBankSlug(originalFileName: string): string {
  for (const [re, slug] of BANK_PATTERNS) {
    if (re.test(originalFileName)) return slug
  }
  return 'unknown'
}

function detectStatementType(originalFileName: string): StatementTypeValue {
  if (/investment/i.test(originalFileName)) return 'investment'
  if (/credit/i.test(originalFileName)) return 'credit'
  return 'debit'
}

// {hash8}-{type}-{bank}-{MM-YYYY}.pdf — strips the original filename which
// often contains the user's real name.
function redactFileName(
  fileHash: string,
  type: StatementTypeValue,
  bankSlug: string,
  periodStart: string | undefined,
): string {
  const hash8 = fileHash.slice(0, 8)
  let mmYyyy = 'unknown'
  if (periodStart) {
    const d = new Date(periodStart)
    if (!isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = String(d.getFullYear())
      mmYyyy = `${mm}-${yyyy}`
    }
  }
  return `${hash8}-${type}-${bankSlug}-${mmYyyy}.pdf`
}

export async function ingestStatement({
  fileName,
  fileBuffer,
  rows,
  metadata,
  userId,
}: IngestOptions) {
  console.log('Ingesting statement', fileName)
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex')

  // Idempotent on (uploaded_by, source_file_sha256).
  const [existing] = await db
    .select({ id: statements.id, status: statements.status })
    .from(statements)
    .where(
      and(
        eq(statements.sourceFileSha256, fileHash),
        eq(statements.uploadedBy, userId),
      ),
    )
    .limit(1)

  if (existing) {
    return {
      success: true,
      statementId: existing.id,
      isDuplicate: true,
      status: existing.status,
    }
  }

  if (!metadata.periodStart || !metadata.periodEnd) {
    throw new Error('Statement period start and end are required.')
  }

  const statementType: StatementTypeValue =
    metadata.statementType ?? detectStatementType(fileName)
  const bankSlug = metadata.bank
    ? metadata.bank
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    : detectBankSlug(fileName)
  const redactedFileName = redactFileName(
    fileHash,
    statementType,
    bankSlug,
    metadata.periodStart,
  )

  const [statement] = await db
    .insert(statements)
    .values({
      sourceFileName: redactedFileName,
      sourceFileSha256: fileHash,
      uploadedBy: userId,
      periodStart: metadata.periodStart,
      periodEnd: metadata.periodEnd,
      bank: metadata.bank || (bankSlug !== 'unknown' ? bankSlug : null),
      accountLast4: metadata.accountLast4 || null,
      currency: metadata.currency || 'SGD',
      status: 'ingesting',
      statementType,
      expectedTotal: metadata.expectedTotal != null ? String(metadata.expectedTotal) : null,
      expectedTotalKind: metadata.expectedTotalKind ?? null,
      previousBalance: metadata.previousBalance != null ? String(metadata.previousBalance) : null,
    })
    .returning()

  if (!statement) {
    throw new Error('Failed to create statement')
  }

  console.log('Created statement', statement.id)

  const uniqueMemberIds = Array.from(
    new Set((metadata.memberIds ?? []).filter(Boolean)),
  )
  if (uniqueMemberIds.length > 0) {
    try {
      await db.insert(statementMembers).values(
        uniqueMemberIds.map(mid => ({
          statementId: statement.id,
          memberId: mid,
        })),
      )
    } catch (err) {
      // Don't fail ingest over attribution.
      console.warn('Failed to attach members to statement', err)
    }
  }

  // Build per-row identifiers + month buckets.
  const transactionsWithIds = rows.map(row => {
    let dateForId = row.date
    if (metadata.periodStart) {
      const year = new Date(metadata.periodStart).getFullYear()
      if (row.date && !/\d{4}/.test(row.date)) {
        dateForId = `${row.date} ${year}`
      }
    }

    const id = generateTransactionIdentifier({
      date: dateForId,
      amount: row.amount.toString(),
      balance: row.balance?.toString() || '0',
      description: row.description,
    })

    let monthBucket = '0000-00'
    try {
      const yyyyMmDd = normalizeDateToYyyyMmDd(dateForId)
      monthBucket = `${yyyyMmDd.substring(0, 4)}-${yyyyMmDd.substring(4, 6)}`
    } catch {
      console.warn('Invalid date for bucket', row.date)
    }

    return { ...row, transaction_identifier: id, month_bucket: monthBucket }
  })

  const allIds = transactionsWithIds.map(t => t.transaction_identifier)

  const duplicates = allIds.length
    ? await db
        .select({
          id: transactions.id,
          identifier: transactions.transactionIdentifier,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(transactions.transactionIdentifier, allIds),
          ),
        )
    : []

  const duplicateMap = new Map<string, string>()
  for (const d of duplicates) duplicateMap.set(d.identifier, d.id)

  const importRows = transactionsWithIds.map(t => {
    let dateForId = t.date
    if (metadata.periodStart) {
      const year = new Date(metadata.periodStart).getFullYear()
      if (t.date && !/\d{4}/.test(t.date)) {
        dateForId = `${t.date} ${year}`
      }
    }
    let dbDate = t.date
    try {
      const yyyyMmDd = normalizeDateToYyyyMmDd(dateForId)
      dbDate = `${yyyyMmDd.substring(0, 4)}-${yyyyMmDd.substring(4, 6)}-${yyyyMmDd.substring(6, 8)}`
    } catch (e) {
      console.warn('Failed to normalize date for DB:', t.date, e)
    }

    return {
      statementId: statement.id,
      transactionIdentifier: t.transaction_identifier,
      resolution: 'pending' as const,
      existingTransactionId: duplicateMap.get(t.transaction_identifier) ?? null,
      date: dbDate,
      monthBucket: t.month_bucket,
      description: t.description,
      amount: String(t.amount),
      balance: t.balance != null ? String(t.balance) : null,
    }
  })

  console.log('Inserting imports, count:', importRows.length)

  let insertedIds: string[] = []
  try {
    if (importRows.length > 0) {
      const inserted = await db
        .insert(transactionImports)
        .values(importRows)
        .returning({ id: transactionImports.id })
      insertedIds = inserted.map(r => r.id)
    }
  } catch (err) {
    await db.delete(statements).where(eq(statements.id, statement.id))
    const msg = err instanceof Error ? err.message : 'unknown'
    throw new Error(`Failed to import transactions: ${msg}`)
  }

  if (insertedIds.length > 0) {
    await autoApplyCategoriesBatch(userId, insertedIds)
    await llmFallbackForUncategorizedImports(userId, statement.id, {
      onlyImportIds: insertedIds,
    })
  }

  await db
    .update(statements)
    .set({ status: 'parsed' })
    .where(eq(statements.id, statement.id))

  // Invalidate the cached statement list and tx-derived lookups (months, years).
  revalidateTag(tag.statements(userId), 'default')
  revalidateTag(tag.tx(userId), 'default')

  return {
    success: true,
    statementId: statement.id,
    isDuplicate: false,
    count: importRows.length,
  }
}
