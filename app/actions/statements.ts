'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ImportReview, DuplicatePair, ImportDecisions, ImportSuggestion, Transaction, Statement as UIStatement } from '@/lib/types/transaction'
import { Database } from '@/lib/supabase/database.types'

type DBImportWithAI = Database['public']['Tables']['transaction_imports']['Row'] & {
  is_excluded?: boolean
  exclusion_reason?: string | null
  suggested_tag_ids?: string[]
  ai_suggestion_status?: ImportSuggestion['status']
}

export interface SuggestionDecision {
  importId: string
  acceptedTagIds: string[]
  primaryTagId?: string
}

type DBTransaction = Database['public']['Tables']['transactions']['Row']
type DBImport = Database['public']['Tables']['transaction_imports']['Row'] & { is_excluded?: boolean, exclusion_reason?: string | null }
type DBStatement = Database['public']['Tables']['statements']['Row']

type CountJoin = { count: number }[] | null | undefined

function countOf(join: CountJoin): number {
  return join?.[0]?.count ?? 0
}

function mapDBStatementToUI(s: DBStatement, transactionCount = 0): UIStatement {
  let bankName = s.bank || 'Unknown Bank'
  if ((bankName === 'Unknown Bank' || !s.bank) && s.source_file_name) {
    bankName = s.source_file_name
  }

  return {
    id: s.id,
    bankName,
    accountLabel: s.account_name || undefined,
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
    source: `Db: ${t.statement_id}`, // Simplified for now
    monthBucket: t.month_bucket,
    transactionIdentifier: t.transaction_identifier,
    statementId: t.statement_id,
    isExcluded: t.is_excluded || false,
    exclusionReason: t.exclusion_reason || undefined,
    tags: [],
    createdAt: t.created_at,
  }
}

function mapImportToTransaction(t: DBImport, currency: string): Transaction {
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

  // 2. Fetch imports
  const { data: importsData, error: importsError } = await (supabase as any)
    .from('transaction_imports')
    .select('*')
    .eq('statement_id', statementId)
    .eq('resolution', 'pending') // Only pending items

  if (importsError) {
    throw new Error(`Failed to fetch imports: ${importsError.message}`)
  }

  const imports = importsData as DBImport[]

  // 3. Separate into new and duplicates
  const newImports = imports.filter(i => !i.existing_transaction_id)
  const duplicateImports = imports.filter(i => i.existing_transaction_id)

  // 4. Skip fetching existing duplicates as we don't show them anymore
  const duplicates: DuplicatePair[] = [] // Empty list for spec 6

  // 5. Surface AI suggestions per import so the review UI can render
  // dashed-outline pills (and poll for status='pending' rows).
  const importsWithAI = imports as DBImportWithAI[]
  const suggestions: ImportSuggestion[] = importsWithAI.map(i => ({
    importId: i.id,
    suggestedTagIds: i.suggested_tag_ids ?? [],
    status: (i.ai_suggestion_status as ImportSuggestion['status']) ?? 'pending',
  }))

  return {
    statement: mapDBStatementToUI(statement, imports.length),
    newTransactions: newImports.map(i => mapImportToTransaction(i, statement.currency || 'SGD')),
    duplicates,
    suggestions,
  }
}

/**
 * Polled by the review screen while any row is `ai_suggestion_status='pending'`.
 * Returns the same shape as ImportReview.suggestions.
 */
export async function getSuggestionsForStatement(statementId: string): Promise<ImportSuggestion[]> {
  const supabase = await createClient()

  const { data, error } = await (supabase as any)
    .from('transaction_imports')
    .select('id, suggested_tag_ids, ai_suggestion_status')
    .eq('statement_id', statementId)
    .eq('resolution', 'pending')

  if (error || !data) return []

  return (data as DBImportWithAI[]).map(i => ({
    importId: i.id,
    suggestedTagIds: i.suggested_tag_ids ?? [],
    status: (i.ai_suggestion_status as ImportSuggestion['status']) ?? 'pending',
  }))
}

export async function confirmStatementImport(
  statementId: string,
  decisions: ImportDecisions['decisions'],
  suggestionDecisions: SuggestionDecision[] = [],
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

  const imports = importsData as DBImport[]

  // 2. Process decisions
  // Create a map of decision by importId
  const decisionMap = new Map(decisions.map(d => [d.importId, d.action]))

  const transactionsToInsert: any[] = []
  const importsToUpdate: { id: string; resolution: 'accepted' | 'rejected' }[] = []

  // Need uploader for transactions, period_end for the post-confirm redirect.
  const { data: statementData } = await (supabase as any)
    .from('statements')
    .select('uploaded_by, period_end')
    .eq('id', statementId)
    .single()
  if (!statementData) return { success: false, error: 'Statement not found' }

  const statement = statementData as { uploaded_by: string; period_end: string | null }

  for (const imp of imports) {
    const action = decisionMap.get(imp.id)
    // Default for new transactions (null existing_id) is accept if not specified? 
    // Or we assume the UI sends "accept" for everything in the "New" section.
    // For duplicates, if action is missing, we default to reject (keep existing).
    // Actually, let's strictly follow what was sent. If not sent, we skip/error?
    // Or we treat "New" ones as accepted by default?
    // The Spec says "Single Accept all new transactions action".

    let resolution: 'accepted' | 'rejected' = 'rejected'

    if (!imp.existing_transaction_id) {
      // It's a new transaction. 
      // If action is explicit reject, we reject. Otherwise verify if we should Auto-accept?
      // The UI sends explicit actions for everything.
      if (action === 'accept') resolution = 'accepted'
    } else {
      // It's a duplicate.
      // If action is 'accept', we add as new.
      // If action is 'reject' (or missing), we keep existing (reject import).
      if (action === 'accept') resolution = 'accepted'
    }

    importsToUpdate.push({ id: imp.id, resolution })

    if (resolution === 'accepted') {
      transactionsToInsert.push({
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
      })
    }
  }

  // Map import.id → transaction_identifier so we can resolve the new
  // transaction.id after insert and apply tag decisions.
  const importIdToIdentifier = new Map<string, string>()
  for (const imp of imports) {
    importIdToIdentifier.set(imp.id, imp.transaction_identifier)
  }

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

  // 3. Apply tag decisions for accepted imports.
  // Resolve new transactions.id by (user_id, transaction_identifier).
  if (suggestionDecisions.length > 0 && acceptedIds.length > 0) {
    const acceptedIdentifiers = acceptedIds
      .map(id => importIdToIdentifier.get(id))
      .filter((s): s is string => Boolean(s))

    if (acceptedIdentifiers.length > 0) {
      const { data: newTxsData } = await (supabase as any)
        .from('transactions')
        .select('id, transaction_identifier')
        .eq('user_id', statement.uploaded_by)
        .in('transaction_identifier', acceptedIdentifiers)

      const identifierToNewId = new Map<string, string>(
        (newTxsData ?? []).map((t: { id: string; transaction_identifier: string }) => [t.transaction_identifier, t.id])
      )

      const tagRows: { transaction_id: string; tag_id: string; is_primary: boolean }[] = []
      for (const decision of suggestionDecisions) {
        if (!decision.acceptedTagIds || decision.acceptedTagIds.length === 0) continue
        const importId = decision.importId
        const identifier = importIdToIdentifier.get(importId)
        if (!identifier) continue
        const txId = identifierToNewId.get(identifier)
        if (!txId) continue

        const primaryTagId = decision.primaryTagId ?? decision.acceptedTagIds[0]
        for (const tagId of decision.acceptedTagIds) {
          tagRows.push({
            transaction_id: txId,
            tag_id: tagId,
            is_primary: tagId === primaryTagId,
          })
        }
      }

      if (tagRows.length > 0) {
        const { error: tagsError } = await (supabase as any)
          .from('transaction_tags')
          .upsert(tagRows, { onConflict: 'transaction_id,tag_id', ignoreDuplicates: true })
        if (tagsError) {
          console.warn('Failed to insert transaction_tags from suggestions')
        }
      }
    }
  }

  // 4. Mark statement as ingested
  await (supabase as any)
    .from('statements')
    .update({ status: 'ingested' })
    .eq('id', statementId)

  revalidateStatementSurfaces()
  revalidatePath(`/statements/${statementId}`)

  // Pick the month bucket the user should land on. Prefer accepted rows so the
  // landing page is non-empty; fall back to statement period_end.
  const acceptedMonths = imports
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
