'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Transaction, MonthSummary } from '@/lib/types/transaction'
import { Database } from '@/lib/supabase/database.types'
import type { Insights, InsightsPeriod, MerchantRow, TagBreakdownRow } from '@/lib/types/insights'

import { formatDate } from '@/lib/utils'

function mapDBTransaction(t: any): Transaction {
  const bankName = t.statements?.bank || 'Unknown'
  const period = t.statements?.period_start ? `(${formatDate(t.statements.period_start).split(' ')[1]} ${formatDate(t.statements.period_start).split(' ')[2]})` : ''

  let sourceLabel = `${bankName} ${period}`
  if (bankName === 'Unknown' && t.statements?.source_file_name) {
    sourceLabel = t.statements.source_file_name
  }
  if (!t.statements) {
    sourceLabel = 'Usage'
  }

  // Map tags from the junction table structure
  // The query returns transaction_tags(tags(...))
  const tags = t.transaction_tags?.map((tt: any) => ({
    id: tt.tags.id,
    name: tt.tags.name,
    color: tt.tags.color
  })) || []

  return {
    id: t.id,
    date: t.date,
    description: t.description,
    amount: t.amount,
    currency: 'SGD',
    source: sourceLabel,
    monthBucket: t.month_bucket,
    transactionIdentifier: t.transaction_identifier,
    statementId: t.statement_id,
    isExcluded: t.is_excluded || false,
    exclusionReason: t.exclusion_reason,
    tags: tags,
    createdAt: t.created_at,
  }
}


export async function getTransactions(month?: string | null, statementId?: string): Promise<Transaction[]> {
  const supabase = await createClient()

  let query = (supabase as any)
    .from('transactions')
    .select(`
        *,
        statements (bank, period_start, source_file_name),
        transaction_tags (
            tags (id, name, color)
        )
    `)
    .eq('status', 'active')
    .order('date', { ascending: false })

  if (month) {
    query = query.eq('month_bucket', month)
  }

  if (statementId) {
    query = query.eq('statement_id', statementId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching transactions:', error)
    throw new Error('Failed to fetch transactions')
  }

  return data.map(mapDBTransaction)
}

export async function getAvailableMonthsList(): Promise<string[]> {
  const supabase = await createClient()

  // Supabase/Postgrest doesn't support SELECT DISTINCT ON (col) cleanly via JS client for just a list of strings
  // But we can fetch distinct month_buckets.
  const { data, error } = await (supabase as any)
    .from('transactions')
    .select('month_bucket')
  //.distinct() // distinct() might not work as expected in all Supabase versions/calls without checking docs, but usually valid

  if (error) {
    console.error('Error fetching months:', error)
    return []
  }

  // extract and unique
  const months = Array.from(new Set((data as any[]).map(d => d.month_bucket))).sort().reverse()
  return months
}

export async function getMonthSummary(month: string | null, statementId?: string): Promise<MonthSummary> {
  const supabase = await createClient()

  let query = (supabase as any)
    .from('transactions')
    .select('amount, statement_id, is_excluded')
    .eq('status', 'active')

  if (month) {
    query = query.eq('month_bucket', month)
  }

  if (statementId) {
    query = query.eq('statement_id', statementId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error('Failed to fetch summary')
  }

  const transactions = data as { amount: number; statement_id: string; is_excluded: boolean }[]

  const totalSpent = transactions
    .filter(t => t.amount > 0 && !t.is_excluded) // Exclude marked transactions and ensuring positive amounts
    .reduce((sum, t) => sum + t.amount, 0)

  const statementCount = new Set(transactions.map(t => t.statement_id)).size

  return {
    month: month || 'All',
    totalSpent,
    transactionCount: transactions.length,
    statementCount,
    currency: 'SGD'
  }
}

export async function updateTransactionExclusion(id: string, isExcluded: boolean, reason?: string) {
  const supabase = await createClient()

  // 1. Try updating transactions table
  const { error: txError, count } = await (supabase.from('transactions') as any)
    .update({
      is_excluded: isExcluded,
      exclusion_reason: isExcluded ? reason : null
    })
    .eq('id', id)
    .select('id', { count: 'exact', head: true }) // Check if any row as updated

  if (!txError && count && count > 0) {
    revalidateExclusionSurfaces()
    return { success: true }
  }

  // 2. If no transaction updated, try transaction_imports
  const { error: impError } = await (supabase.from('transaction_imports') as any)
    .update({
      is_excluded: isExcluded,
      exclusion_reason: isExcluded ? reason : null
    })
    .eq('id', id)

  if (impError) {
    console.error('Failed to update transaction/import exclusion:', impError)
    throw new Error('Failed to update exclusion')
  }

  revalidateExclusionSurfaces()
  return { success: true }
}

// Exclusion changes feed totals on /transactions and /insights, and the per-
// statement transaction list on /statements/[id]. Review screens read directly
// off transaction_imports so revalidate that dynamic route too.
function revalidateExclusionSurfaces() {
  revalidatePath('/transactions')
  revalidatePath('/insights')
  revalidatePath('/statements/[id]', 'page')
  revalidatePath('/imports/[statementId]/review', 'page')
}

export async function getStatementsForMonth(month: string): Promise<{ id: string; label: string }[]> {
  const supabase = await createClient()

  // Get distinct statement IDs for the month
  const { data, error } = await (supabase as any)
    .from('transactions')
    .select('statement_id, statements(id, bank, period_start, source_file_name)')
    .eq('month_bucket', month)
    .eq('status', 'active')

  if (error) {
    console.error('Error fetching statements for month:', error)
    return []
  }

  // Deduplicate and map
  const uniqueStatements = new Map<string, string>()

  data.forEach((t: any) => {
    if (t.statements) {
      const bank = t.statements.bank || 'Unknown'
      const period = t.statements.period_start ? `(${formatDate(t.statements.period_start).split(' ')[1]} ${formatDate(t.statements.period_start).split(' ')[2]})` : ''

      let label = `${bank} ${period}`
      if (bank === 'Unknown' && t.statements.source_file_name) {
        label = t.statements.source_file_name
      }

      uniqueStatements.set(t.statements.id, label)
    }
  })

  return Array.from(uniqueStatements.entries()).map(([id, label]) => ({ id, label }))
}

export async function getYearsWithDataList(): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await (supabase as any)
    .from('transactions')
    .select('month_bucket')
    .eq('status', 'active')

  if (error || !data) return []

  const years = new Set<string>()
  for (const row of data as { month_bucket: string }[]) {
    if (row.month_bucket && row.month_bucket.length >= 4) {
      years.add(row.month_bucket.slice(0, 4))
    }
  }
  return Array.from(years).sort().reverse()
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatPeriodLabel(period: InsightsPeriod, statementLabelById: Map<string, string>): string {
  if (period.type === 'statement') {
    return statementLabelById.get(period.statementId) || 'Statement'
  }
  if (period.type === 'year') return period.year
  // month: 'YYYY-MM'
  const [year, month] = period.month.split('-')
  const idx = parseInt(month, 10) - 1
  return `${MONTH_NAMES[idx] || month} ${year}`
}

interface InsightsTxRow {
  amount: number
  description: string
  statement_id: string
  statements: { currency: string | null } | null
  transaction_tags: { is_primary: boolean; tags: { id: string; name: string; color: string | null } | null }[]
}

export async function getInsights(period: InsightsPeriod): Promise<Insights> {
  const supabase = await createClient()

  let query = (supabase as any)
    .from('transactions')
    .select(`
      amount,
      description,
      statement_id,
      statements (currency, source_file_name, bank, period_start),
      transaction_tags (is_primary, tags (id, name, color))
    `)
    .eq('status', 'active')
    .eq('is_excluded', false)
    .gt('amount', 0)

  if (period.type === 'statement') {
    query = query.eq('statement_id', period.statementId)
  } else if (period.type === 'month') {
    query = query.eq('month_bucket', period.month)
  } else {
    query = query.like('month_bucket', `${period.year}-%`)
  }

  const { data, error } = await query

  // Resolve statement label for period.type === 'statement' rendering.
  const statementLabelById = new Map<string, string>()
  if (period.type === 'statement') {
    const { data: stmt } = await (supabase as any)
      .from('statements')
      .select('id, bank, source_file_name, period_start')
      .eq('id', period.statementId)
      .maybeSingle()
    if (stmt) {
      const s = stmt as { id: string; bank: string | null; source_file_name: string; period_start: string }
      const bank = s.bank || s.source_file_name || 'Statement'
      statementLabelById.set(s.id, `${bank} (${s.period_start.slice(0, 7)})`)
    }
  }

  if (error || !data) {
    return {
      periodLabel: formatPeriodLabel(period, statementLabelById),
      currency: 'SGD',
      totalSpent: 0,
      transactionCount: 0,
      statementCount: 0,
      tagBreakdown: [],
      topMerchants: [],
    }
  }

  const rows = data as InsightsTxRow[]

  // Aggregate. Each transaction's full amount goes to its primary tag (or
  // 'Untagged' if none) — keeps totals consistent and matches user intuition
  // ("I spent $5 on coffee", not "$2.50 on Coffee + $2.50 on Food").
  const tagAggregates = new Map<string, { tagName: string; tagColor: string | null; amount: number; count: number }>()
  const merchantAggregates = new Map<string, { amount: number; count: number }>()
  const statementIds = new Set<string>()
  let totalSpent = 0
  const UNTAGGED_KEY = '__untagged__'

  let currency = 'SGD'

  for (const row of rows) {
    totalSpent += row.amount
    statementIds.add(row.statement_id)
    if (row.statements?.currency) currency = row.statements.currency

    // Pick the primary tag, fall back to first available, fall back to untagged.
    const primary = row.transaction_tags.find(t => t.is_primary && t.tags) ?? row.transaction_tags.find(t => t.tags)
    const tagId = primary?.tags?.id ?? UNTAGGED_KEY
    const existing = tagAggregates.get(tagId)
    if (existing) {
      existing.amount += row.amount
      existing.count += 1
    } else {
      tagAggregates.set(tagId, {
        tagName: primary?.tags?.name ?? 'Untagged',
        tagColor: primary?.tags?.color ?? null,
        amount: row.amount,
        count: 1,
      })
    }

    const merchKey = row.description.trim()
    const m = merchantAggregates.get(merchKey)
    if (m) {
      m.amount += row.amount
      m.count += 1
    } else {
      merchantAggregates.set(merchKey, { amount: row.amount, count: 1 })
    }
  }

  const tagBreakdown: TagBreakdownRow[] = Array.from(tagAggregates.entries())
    .map(([id, a]) => ({
      tagId: id === UNTAGGED_KEY ? null : id,
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

  return {
    periodLabel: formatPeriodLabel(period, statementLabelById),
    currency,
    totalSpent,
    transactionCount: rows.length,
    statementCount: statementIds.size,
    tagBreakdown,
    topMerchants,
  }
}
