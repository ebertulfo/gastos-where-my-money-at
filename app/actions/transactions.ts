'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Transaction, MonthSummary } from '@/lib/types/transaction'
import { Database } from '@/lib/supabase/database.types'
import type { Insights, InsightsFilters, InsightsPeriod, InsightsTravelMode, MemberBreakdownRow, MerchantRow, TagBreakdownRow } from '@/lib/types/insights'

import { formatDate, humanizeBankSlug } from '@/lib/utils'

function mapDBTransaction(
  t: any,
  categoryById: Map<string, ResolvedCategory>,
): Transaction {
  const bankName = humanizeBankSlug(t.statements?.bank)
  const period = t.statements?.period_start ? `(${formatDate(t.statements.period_start).split(' ')[1]} ${formatDate(t.statements.period_start).split(' ')[2]})` : ''

  let sourceLabel = `${bankName} ${period}`.trim()
  if (!t.statements) {
    sourceLabel = 'Usage'
  }

  // Labels (free-form, multi). The junction now carries kind='label' rows only.
  const tags = t.transaction_tags?.map((tt: any) => ({
    id: tt.tags.id,
    name: tt.tags.name,
    color: tt.tags.color,
  })) || []

  // Resolve category from the pre-fetched map. PostgREST nested self-joins
  // on `tags!parent_id` were silently returning null, so we fetch ids flat
  // and resolve via map instead.
  const resolved = t.category_id ? categoryById.get(t.category_id) : null
  const category = resolved
    ? {
        id: resolved.id,
        name: resolved.name,
        parentName: resolved.parentName,
        color: resolved.color,
      }
    : null

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
    category,
    categorySource: t.category_source ?? null,
    isTravel: Boolean(t.is_travel),
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

  // Resolve categories + parents via a separate fetch so the nested
  // PostgREST self-join doesn't blank everything out.
  const referencedCategoryIds = Array.from(
    new Set((data as any[]).map(t => t.category_id).filter((id): id is string => Boolean(id))),
  )
  const categoryById = await resolveCategoriesWithParents(supabase, referencedCategoryIds)

  return (data as any[]).map(t => mapDBTransaction(t, categoryById))
}

/**
 * Fetches the transactions that belong to a given top-level category rollup
 * within the same period + filter context the insights page is showing.
 * Used by the "drill into a category" modal on /insights.
 *
 * `rollupCategoryId` is either:
 *   - a top-level category id → matches that category and all its children;
 *   - a string like '__uncategorized__' → matches transactions with category_id IS NULL.
 */
export async function getTransactionsForCategoryRollup(
  rollupCategoryId: string,
  period: InsightsPeriod,
  filters: InsightsFilters = { memberIds: [], travelMode: 'all' },
): Promise<Transaction[]> {
  const supabase = await createClient()

  // Resolve rollup → set of acceptable category ids. For Uncategorized we
  // pass an empty set + filter `category_id IS NULL`.
  const isUncategorized = rollupCategoryId === '__uncategorized__'
  const acceptableCategoryIds: string[] = []
  if (!isUncategorized) {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return []
    acceptableCategoryIds.push(rollupCategoryId)
    const { data: childRows } = await (supabase as any)
      .from('tags')
      .select('id')
      .eq('user_id', userData.user.id)
      .eq('parent_id', rollupCategoryId)
    for (const r of (childRows ?? []) as { id: string }[]) acceptableCategoryIds.push(r.id)
  }

  // Member filter — same approach as getInsights.
  let allowedStatementIds: Set<string> | null = null
  if (filters.memberIds.length > 0) {
    const { data: smRows } = await (supabase as any)
      .from('statement_members')
      .select('statement_id')
      .in('member_id', filters.memberIds)
    allowedStatementIds = new Set(((smRows ?? []) as { statement_id: string }[]).map(r => r.statement_id))
    if (allowedStatementIds.size === 0) return []
  }

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

  if (period.type === 'statement') query = query.eq('statement_id', period.statementId)
  else if (period.type === 'month') query = query.eq('month_bucket', period.month)
  else query = query.like('month_bucket', `${period.year}-%`)

  if (allowedStatementIds) query = query.in('statement_id', Array.from(allowedStatementIds))
  if (filters.travelMode === 'travel') query = query.eq('is_travel', true)
  else if (filters.travelMode === 'no-travel') query = query.eq('is_travel', false)

  if (isUncategorized) query = query.is('category_id', null)
  else query = query.in('category_id', acceptableCategoryIds)

  const { data, error } = await query
  if (error || !data) return []

  const referencedIds = Array.from(
    new Set((data as any[]).map(t => t.category_id).filter((id): id is string => Boolean(id))),
  )
  const categoryById = await resolveCategoriesWithParents(supabase, referencedIds)
  return (data as any[]).map(t => mapDBTransaction(t, categoryById))
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

/**
 * User-toggleable travel flag. Auto-set at ingest by detectIsTravel; this
 * action lets the user override the heuristic on either a confirmed
 * transaction or a still-staging import.
 */
export async function setTransactionTravel(id: string, isTravel: boolean) {
  const supabase = await createClient()

  const { count } = await (supabase.from('transactions') as any)
    .update({ is_travel: isTravel })
    .eq('id', id)
    .select('id', { count: 'exact', head: true })

  if (count && count > 0) {
    revalidateExclusionSurfaces()
    return { success: true }
  }

  const { error: impError } = await (supabase.from('transaction_imports') as any)
    .update({ is_travel: isTravel })
    .eq('id', id)

  if (impError) {
    console.error('Failed to update travel flag:', impError)
    throw new Error('Failed to update travel flag')
  }
  revalidateExclusionSurfaces()
  return { success: true }
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
      const bank = humanizeBankSlug(t.statements.bank)
      const period = t.statements.period_start ? `(${formatDate(t.statements.period_start).split(' ')[1]} ${formatDate(t.statements.period_start).split(' ')[2]})` : ''
      const label = `${bank} ${period}`.trim()
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
  category_id: string | null
  category_source: 'user' | 'ai' | null
  is_travel: boolean
  statements: { currency: string | null } | null
}

interface ResolvedCategory {
  id: string
  name: string
  color: string | null
  parentId: string | null
  parentName: string | null
  parentColor: string | null
}

export async function getInsights(
  period: InsightsPeriod,
  filters: InsightsFilters = { memberIds: [], travelMode: 'all' },
): Promise<Insights> {
  const supabase = await createClient()

  // Resolve which statements pass the optional member filter. Done here as
  // a discrete step so the main transactions query stays a simple period
  // filter — joining `statement_members` inline gets gnarly via PostgREST.
  let allowedStatementIds: Set<string> | null = null
  if (filters.memberIds.length > 0) {
    const { data: smRows } = await (supabase as any)
      .from('statement_members')
      .select('statement_id')
      .in('member_id', filters.memberIds)
    allowedStatementIds = new Set(((smRows ?? []) as { statement_id: string }[]).map(r => r.statement_id))
    if (allowedStatementIds.size === 0) {
      // Filter selected member(s) but they're attributed to nothing — short-circuit.
      return emptyInsights(period)
    }
  }

  let query = (supabase as any)
    .from('transactions')
    .select(`
      amount,
      description,
      statement_id,
      category_id,
      category_source,
      is_travel,
      statements (currency, source_file_name, bank, period_start)
    `)
    .eq('status', 'active')
    .eq('is_excluded', false)
    .gt('amount', 0)

  if (allowedStatementIds) {
    query = query.in('statement_id', Array.from(allowedStatementIds))
  }

  if (filters.travelMode === 'travel') query = query.eq('is_travel', true)
  else if (filters.travelMode === 'no-travel') query = query.eq('is_travel', false)

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
      .select('id, bank, period_start')
      .eq('id', period.statementId)
      .maybeSingle()
    if (stmt) {
      const s = stmt as { id: string; bank: string | null; period_start: string }
      statementLabelById.set(s.id, `${humanizeBankSlug(s.bank)} (${s.period_start.slice(0, 7)})`)
    }
  }

  if (error || !data) {
    return emptyInsights(period, formatPeriodLabel(period, statementLabelById))
  }

  const rows = data as InsightsTxRow[]

  // Resolve category metadata (name + parent) in one extra round-trip.
  // Avoids the PostgREST nested self-join on tags!parent_id which silently
  // returned null when the relationship couldn't disambiguate, leaving
  // every row "Uncategorized" even though category_id was set.
  const referencedCategoryIds = Array.from(
    new Set(rows.map(r => r.category_id).filter((id): id is string => Boolean(id))),
  )
  const categoryById = await resolveCategoriesWithParents(supabase, referencedCategoryIds)

  // Roll up by top-level category. Sub-categories aggregate under their
  // parent so "Food" totals include groceries+dining+coffee etc.
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
    statementIds.add(row.statement_id)
    if (row.statements?.currency) currency = row.statements.currency
    if (row.category_id) {
      categorizedCount += 1
      if (row.category_source === 'ai') aiCategorizedCount += 1
    }
    if (row.is_travel) {
      travelSpent += row.amount
      travelTransactionCount += 1
    }

    const cat = row.category_id ? categoryById.get(row.category_id) : null
    // Roll up to top-level. If cat is a sub, attribute to its parent.
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

    // Group by a normalized merchant key so per-transaction trailing
    // tokens (foreign currency amounts, ref ids, store codes) don't split
    // the same merchant into many rows.
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

  // Per-member rollup. We only need attributions for statements that actually
  // contributed transactions in this period — restrict the lookup so an
  // unrelated statement attributed to "Edrian" doesn't appear in this view.
  const memberBreakdown = await computeMemberBreakdown(
    supabase,
    Array.from(statementIds),
    rows,
  )

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

/**
 * Resolves a flat list of category ids into rich rows with each category's
 * parent name/color (if any). Done in one extra round-trip per insights
 * fetch instead of via a PostgREST nested self-join — that join silently
 * returned null in some envs, leaving every row Uncategorized.
 */
async function resolveCategoriesWithParents(
  supabase: any,
  categoryIds: string[],
): Promise<Map<string, ResolvedCategory>> {
  const out = new Map<string, ResolvedCategory>()
  if (categoryIds.length === 0) return out

  // First pass: fetch each requested category. Track parent ids we still
  // need to resolve so we can do one batched second pass.
  const { data: directRows } = await (supabase as any)
    .from('tags')
    .select('id, name, color, parent_id')
    .in('id', categoryIds)
  type Row = { id: string; name: string; color: string | null; parent_id: string | null }
  const direct = (directRows ?? []) as Row[]
  const parentsToFetch = new Set<string>()
  for (const r of direct) {
    if (r.parent_id) parentsToFetch.add(r.parent_id)
  }

  let parentMap = new Map<string, { name: string; color: string | null }>()
  if (parentsToFetch.size > 0) {
    const { data: parentRows } = await (supabase as any)
      .from('tags')
      .select('id, name, color')
      .in('id', Array.from(parentsToFetch))
    parentMap = new Map(
      ((parentRows ?? []) as { id: string; name: string; color: string | null }[])
        .map(p => [p.id, { name: p.name, color: p.color }]),
    )
  }

  for (const r of direct) {
    const parent = r.parent_id ? parentMap.get(r.parent_id) : null
    out.set(r.id, {
      id: r.id,
      name: r.name,
      color: r.color,
      parentId: r.parent_id,
      parentName: parent?.name ?? null,
      parentColor: parent?.color ?? null,
    })
  }
  return out
}

// Common ISO 4217 codes + spelled-out currency names that appear at the end
// of merchant descriptions on bank statements (e.g. "JR EAST SIBUYAKU JP YEN
// 29,880"). Kept narrow on purpose — a too-aggressive list would strip
// legitimate merchant tokens.
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

/**
 * Reduces a transaction description to a stable merchant identifier so the
 * "Top merchants" rollup actually groups same-merchant rows together.
 *
 * Strips, in order:
 *   - <*_redacted> placeholders (left over from PII redaction).
 *   - everything after a `*` separator (card descriptors like "AIRBNB * ref").
 *   - trailing "<COUNTRY> <CURRENCY> <amount>" blocks ("JP YEN 29,880").
 *   - trailing "<CURRENCY> <amount>" blocks.
 *   - trailing pure-numeric reference IDs (≥4 digits).
 *   - trailing "(NN)" store-code parentheticals.
 */
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
  supabase: any,
  statementIds: string[],
  rows: InsightsTxRow[],
): Promise<MemberBreakdownRow[]> {
  if (statementIds.length === 0 || rows.length === 0) return []

  const { data: memberRows } = await (supabase as any)
    .from('statement_members')
    .select('statement_id, member:household_members (id, name, color)')
    .in('statement_id', statementIds)

  const membersByStatement = new Map<string, { id: string; name: string; color: string | null }[]>()
  type MemberRowFromJoin = { statement_id: string; member: { id: string; name: string; color: string | null } | null }
  for (const r of (memberRows ?? []) as MemberRowFromJoin[]) {
    if (!r.member) continue
    const list = membersByStatement.get(r.statement_id) ?? []
    list.push(r.member)
    membersByStatement.set(r.statement_id, list)
  }

  const aggregate = new Map<string, MemberBreakdownRow>()
  for (const row of rows) {
    const members = membersByStatement.get(row.statement_id) ?? []
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
