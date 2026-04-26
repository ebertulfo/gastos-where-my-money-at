'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ImportReview, DuplicatePair, ImportDecisions, StatementReconciliation, Transaction, Statement as UIStatement } from '@/lib/types/transaction'
import { Database } from '@/lib/supabase/database.types'
import { humanizeBankSlug } from '@/lib/utils'

type DBTransaction = Database['public']['Tables']['transactions']['Row']
type DBImport = Database['public']['Tables']['transaction_imports']['Row'] & { is_excluded?: boolean, exclusion_reason?: string | null }
type DBStatement = Database['public']['Tables']['statements']['Row']

type CountJoin = { count: number }[] | null | undefined

function countOf(join: CountJoin): number {
  return join?.[0]?.count ?? 0
}

function mapDBStatementToUI(s: DBStatement, transactionCount = 0): UIStatement {
  // Never fall back to source_file_name — it's the redacted form
  // (`{hash8}-{type}-{bank}-{MM-YYYY}.pdf`) and is intentionally opaque.
  // Display layer humanizes the bank slug; "Unknown bank" is the honest
  // fallback when detection failed.
  return {
    id: s.id,
    bankName: humanizeBankSlug(s.bank),
    statementType: s.statement_type as UIStatement['statementType'],
    periodStart: s.period_start,
    periodEnd: s.period_end,
    currency: s.currency || 'SGD',
    transactionCount,
    status: (s.status === 'ingesting' || s.status === 'parsed') ? 'reviewing' : (s.status as UIStatement['status']),
    fileHash: s.source_file_sha256,
    createdAt: s.created_at,
  }
}

// Pages that read these surfaces — kept here so revalidations after every
// mutation in this module hit the same set.
const STATEMENT_REVALIDATE_PATHS = ['/statements', '/upload', '/transactions', '/insights'] as const

function revalidateStatementSurfaces() {
  for (const path of STATEMENT_REVALIDATE_PATHS) revalidatePath(path)
}

function mapDBTransaction(t: DBTransaction): Transaction {
  return {
    id: t.id,
    date: t.date,
    description: t.description,
    amount: t.amount,
    currency: 'SGD', // TODO: Fetch from statement or store on transaction
    source: `Db: ${t.statement_id}`,
    monthBucket: t.month_bucket,
    transactionIdentifier: t.transaction_identifier,
    statementId: t.statement_id,
    isExcluded: t.is_excluded || false,
    exclusionReason: t.exclusion_reason || undefined,
    category: null,
    categorySource: null,
    isTravel: Boolean((t as any).is_travel),
    tags: [],
    createdAt: t.created_at,
  }
}

function mapImportToTransaction(
  t: DBImport,
  currency: string,
  categoryById: Map<string, { id: string; name: string; color: string | null; parent_name: string | null }>,
): Transaction {
  const cat = (t as any).category_id ? categoryById.get((t as any).category_id) : null
  return {
    id: t.id, // Using import ID as transaction ID for preview
    date: t.date,
    description: t.description,
    amount: t.amount,
    currency: currency,
    source: 'Current Upload',
    monthBucket: t.month_bucket,
    transactionIdentifier: t.transaction_identifier,
    statementId: t.statement_id,
    isExcluded: t.is_excluded || false,
    exclusionReason: t.exclusion_reason || undefined,
    category: cat
      ? { id: cat.id, name: cat.name, parentName: cat.parent_name, color: cat.color }
      : null,
    categorySource: ((t as any).category_source as 'user' | 'ai' | null) ?? null,
    isTravel: Boolean((t as any).is_travel),
    tags: [],
    createdAt: t.created_at,
  }
}

export async function getReviewData(statementId: string): Promise<ImportReview> {
  const supabase = await createClient()

  // 1. Fetch statement
  const { data: statementData, error: statementError } = await (supabase as any)
    .from('statements')
    .select('*')
    .eq('id', statementId)
    .single()

  if (statementError || !statementData) {
    throw new Error(`Statement not found: ${statementError?.message}`)
  }

  const statement = statementData as DBStatement

  // 2. Fetch imports — most-recent first matches /transactions UX, and
  // is deterministic. Tie-break on created_at so same-day rows hold
  // their PDF order (parser emits page-by-page, which is the closest
  // signal to "the order the issuer printed them").
  const { data: importsData, error: importsError } = await (supabase as any)
    .from('transaction_imports')
    .select('*')
    .eq('statement_id', statementId)
    .eq('resolution', 'pending')
    .order('date', { ascending: false })
    .order('created_at', { ascending: true })

  if (importsError) {
    throw new Error(`Failed to fetch imports: ${importsError.message}`)
  }

  const imports = importsData as DBImport[]

  // 3. Resolve category names for AI-applied + user-applied categories so we
  // can render pills without an extra round-trip on the client.
  const categoryIds = Array.from(
    new Set(
      imports
        .map(i => (i as any).category_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  )
  const categoryById = new Map<string, { id: string; name: string; color: string | null; parent_name: string | null }>()
  if (categoryIds.length > 0) {
    const { data: catData } = await (supabase as any)
      .from('tags')
      .select('id, name, color, parent_id, parent:tags!parent_id (name)')
      .in('id', categoryIds)
    for (const c of (catData ?? []) as { id: string; name: string; color: string | null; parent_id: string | null; parent: { name: string } | null }[]) {
      categoryById.set(c.id, {
        id: c.id,
        name: c.name,
        color: c.color,
        parent_name: c.parent?.name ?? null,
      })
    }
  }

  // 4. Separate into new and duplicates
  const newImports = imports.filter(i => !i.existing_transaction_id)
  const duplicateImports = imports.filter(i => i.existing_transaction_id)

  // 5. Skip fetching existing duplicates as we don't show them anymore
  const duplicates: DuplicatePair[] = [] // Empty list for spec 6

  // 6. Reconciliation: compare the statement's printed total against the
  // sum of extracted import amounts.
  const reconciliation = computeReconciliation(statement, imports)

  return {
    statement: mapDBStatementToUI(statement, imports.length),
    newTransactions: newImports.map(i => mapImportToTransaction(i, statement.currency || 'SGD', categoryById)),
    duplicates,
    reconciliation,
  }
}

const RECONCILIATION_TOLERANCE = 0.5

function computeReconciliation(
  statement: DBStatement & { expected_total?: number | null; expected_total_kind?: string | null },
  imports: DBImport[],
): StatementReconciliation {
  const currency = statement.currency || 'SGD'
  const expectedTotal = statement.expected_total ?? null
  const kind = (statement.expected_total_kind ?? null) as StatementReconciliation['expectedTotalKind']

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

  // Aggregate amounts according to the kind's sign convention. Both
  // numbers are normalised to the same shape so diff is just a subtraction.
  const extractedTotal = imports.reduce((acc, imp) => {
    const amt = Number(imp.amount) || 0
    return acc + (kind === 'bank_withdrawals_abs' ? Math.abs(amt) : amt)
  }, 0)

  const diff = Number((extractedTotal - expectedTotal).toFixed(2))
  const status: StatementReconciliation['status'] = Math.abs(diff) <= RECONCILIATION_TOLERANCE ? 'match' : 'mismatch'

  return {
    status,
    expectedTotal,
    expectedTotalKind: kind,
    extractedTotal: Number(extractedTotal.toFixed(2)),
    diff,
    currency,
  }
}

export async function confirmStatementImport(
  statementId: string,
  decisions: ImportDecisions['decisions'],
): Promise<{ success: boolean; error?: string; targetMonth?: string }> {
  const supabase = await createClient()

  // 1. Fetch all pending imports for this statement
  const { data: importsData, error: fetchError } = await (supabase as any)
    .from('transaction_imports')
    .select('*')
    .eq('statement_id', statementId)
    .eq('resolution', 'pending')

  if (fetchError || !importsData) {
    return { success: false, error: fetchError?.message || 'No imports found' }
  }

  const initialImports = importsData as DBImport[]

  // 2. Process decisions
  const decisionMap = new Map(decisions.map(d => [d.importId, d.action]))
  const importsToUpdate: { id: string; resolution: 'accepted' | 'rejected' }[] = []
  const acceptedImportIds: string[] = []

  for (const imp of initialImports) {
    const action = decisionMap.get(imp.id)
    let resolution: 'accepted' | 'rejected' = 'rejected'
    if (!imp.existing_transaction_id) {
      if (action === 'accept') resolution = 'accepted'
    } else {
      if (action === 'accept') resolution = 'accepted'
    }
    importsToUpdate.push({ id: imp.id, resolution })
    if (resolution === 'accepted') acceptedImportIds.push(imp.id)
  }

  // Need uploader for transactions, period_end for the post-confirm redirect.
  const { data: statementData } = await (supabase as any)
    .from('statements')
    .select('uploaded_by, period_end')
    .eq('id', statementId)
    .single()
  if (!statementData) return { success: false, error: 'Statement not found' }

  const statement = statementData as { uploaded_by: string; period_end: string | null }

  // 2b. Categorization already happened at ingest (free signals + LLM)
  // so this is a clean read of staging. No more OpenAI calls at confirm.
  let accepted: DBImport[] = []
  if (acceptedImportIds.length > 0) {
    const { data: refreshed } = await (supabase as any)
      .from('transaction_imports')
      .select('*')
      .in('id', acceptedImportIds)
    accepted = (refreshed ?? []) as DBImport[]
  }

  // 3. Build transactionsToInsert from the re-fetched, fully-categorized rows.
  const transactionsToInsert: any[] = accepted.map(imp => ({
    user_id: statement.uploaded_by,
    statement_id: imp.statement_id,
    transaction_identifier: imp.transaction_identifier,
    date: imp.date,
    month_bucket: imp.month_bucket,
    description: imp.description,
    amount: imp.amount,
    balance: imp.balance,
    statement_page: imp.statement_page,
    line_number: imp.line_number,
    status: 'active',
    is_excluded: imp.is_excluded,
    exclusion_reason: imp.exclusion_reason,
    category_id: (imp as any).category_id ?? null,
    category_source: (imp as any).category_source ?? null,
    description_embedding: (imp as any).description_embedding ?? null,
    is_travel: (imp as any).is_travel ?? false,
  }))

  if (transactionsToInsert.length > 0) {
    const { error: insertError } = await (supabase as any)
      .from('transactions')
      .insert(transactionsToInsert)
      .select() // Optional, but good for debug
    // Supabase JS client doesn't fully type 'onConflict' in all versions without specific generic, 
    // but passing it as an option object to select() or upsert() works. 
    // wait, insert() options logic: .insert(data, { defaultToNull: true, count: null })
    // If we want ON CONFLICT DO NOTHING, we typically use upsert() with ignoreDuplicates: true

    if (insertError) {
      // Retry with upsert / ignoreDuplicates if standard insert fails or use upsert directly
      console.warn("Insert failed, trying upsert with ignoreDuplicates", insertError.message)

      const { error: upsertError } = await (supabase as any)
        .from('transactions')
        .upsert(transactionsToInsert, {
          onConflict: 'user_id, transaction_identifier',
          ignoreDuplicates: true
        })

      if (upsertError) {
        return { success: false, error: `Failed to insert transactions: ${upsertError.message}` }
      }
    }
  }

  // Update resolutions
  // Supabase doesn't support bulk update with different values easily in one query unless we use upsert or rpc.
  // For now, simpler to do a loop or Promise.all if count is low (<1000). 
  // Optimization: Split into "accepted" list and "rejected" list and do two batch updates?
  // Actually, 'transaction_imports' primary key is ID. We can update all 'accepted' IDs to accepted, and 'rejected' to rejected.

  const acceptedIds = importsToUpdate.filter(i => i.resolution === 'accepted').map(i => i.id)
  const rejectedIds = importsToUpdate.filter(i => i.resolution === 'rejected').map(i => i.id)

  if (acceptedIds.length > 0) {
    await (supabase as any).from('transaction_imports').update({ resolution: 'accepted' }).in('id', acceptedIds)
  }
  if (rejectedIds.length > 0) {
    await (supabase as any).from('transaction_imports').update({ resolution: 'rejected' }).in('id', rejectedIds)
  }

  // Mark statement as ingested. Categories were filled in at step 2b
  // (LLM fallback) and promoted in step 3.
  await (supabase as any)
    .from('statements')
    .update({ status: 'ingested' })
    .eq('id', statementId)

  revalidateStatementSurfaces()
  revalidatePath(`/statements/${statementId}`)

  // Pick the month bucket the user should land on. Prefer accepted rows so the
  // landing page is non-empty; fall back to statement period_end.
  const acceptedMonths = initialImports
    .filter(i => decisionMap.get(i.id) === 'accept' || !i.existing_transaction_id)
    .map(i => i.month_bucket)
    .filter((m): m is string => Boolean(m))
    .sort()
  const targetMonth =
    acceptedMonths[acceptedMonths.length - 1] ||
    (statement.period_end ? statement.period_end.slice(0, 7) : undefined)

  return { success: true, targetMonth }
}

export async function getRecentStatements(): Promise<UIStatement[]> {
  const supabase = await createClient()

  const { data: statementsData, error } = await (supabase as any)
    .from('statements')
    .select('*, transactions(count), transaction_imports(count)')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error || !statementsData) {
    console.error("Failed to fetch recent statements:", error)
    return []
  }

  const statements = statementsData as (DBStatement & {
    transactions: CountJoin
    transaction_imports: CountJoin
  })[]

  return statements.map(s =>
    mapDBStatementToUI(s, countOf(s.transactions) || countOf(s.transaction_imports))
  )
}

export async function deleteStatement(statementId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await (supabase as any)
    .from('statements')
    .delete()
    .eq('id', statementId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidateStatementSurfaces()
  revalidatePath(`/statements/${statementId}`)
  return { success: true }
}

export async function getStatements(): Promise<UIStatement[]> {
  const supabase = await createClient()

  const { data: statementsData, error } = await (supabase as any)
    .from('statements')
    .select('*, transactions(count), transaction_imports(count)')
    .order('created_at', { ascending: false })

  if (error || !statementsData) {
    console.error("Failed to fetch statements:", error)
    return []
  }

  const statements = statementsData as (DBStatement & {
    transactions: CountJoin
    transaction_imports: CountJoin
  })[]

  return statements.map(s =>
    mapDBStatementToUI(s, countOf(s.transactions) || countOf(s.transaction_imports))
  )
}

export async function getStatementById(id: string): Promise<UIStatement | null> {
  const supabase = await createClient()

  const { data: statementData, error } = await (supabase as any)
    .from('statements')
    .select('*, transactions(count), transaction_imports(count)')
    .eq('id', id)
    .single()

  if (error || !statementData) {
    return null
  }

  const s = statementData as (DBStatement & {
    transactions: CountJoin
    transaction_imports: CountJoin
  })

  return mapDBStatementToUI(s, countOf(s.transactions) || countOf(s.transaction_imports))
}

export async function getPendingStatements(): Promise<UIStatement[]> {
  const supabase = await createClient()

  const { data: statementsData, error } = await (supabase as any)
    .from('statements')
    .select('*, transaction_imports(count)')
    .in('status', ['parsed', 'ingesting'])
    .order('created_at', { ascending: true })

  if (error || !statementsData) {
    console.error("Failed to fetch pending statements:", error)
    return []
  }

  const statements = statementsData as (DBStatement & { transaction_imports: CountJoin })[]
  return statements.map(s => mapDBStatementToUI(s, countOf(s.transaction_imports)))
}

export async function saveDuplicateDecision(importId: string, decision: 'accept' | 'reject'): Promise<void> {
  const supabase = await createClient()

  // We store the draft decision in the 'notes' column with a prefix
  const noteContent = `DRAFT:${decision}`

  const { data, error } = await (supabase as any)
    .from('transaction_imports')
    .update({ notes: noteContent })
    .eq('id', importId)
    .select('statement_id')
    .single()

  if (error) {
    console.error(`Failed to save duplicate decision for ${importId}:`, error)
    throw new Error('Failed to save decision')
  }

  const statementId = (data as { statement_id?: string } | null)?.statement_id
  if (statementId) {
    revalidatePath(`/imports/${statementId}/review`)
  }
}
