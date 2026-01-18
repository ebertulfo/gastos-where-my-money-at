'use server'

import { createClient } from '@/lib/supabase/server'
import { ImportReview, DuplicatePair, ImportDecisions, Transaction, Statement as UIStatement } from '@/lib/types/transaction'
import { Database } from '@/lib/supabase/database.types'

type DBTransaction = Database['public']['Tables']['transactions']['Row']
type DBImport = Database['public']['Tables']['transaction_imports']['Row']
type DBStatement = Database['public']['Tables']['statements']['Row']

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
    isExcluded: false,
    exclusionReason: undefined,
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

  // 4. Fetch existing transactions for duplicates
  let duplicates: DuplicatePair[] = []

  if (duplicateImports.length > 0) {
    const existingIds = duplicateImports.map(i => i.existing_transaction_id!) // Validated by filter
    const { data: existingTransactionsData, error: existingError } = await (supabase as any)
      .from('transactions')
      .select('*')
      .in('id', existingIds)

    if (existingError) {
      throw new Error(`Failed to fetch existing transactions: ${existingError.message}`)
    }

    const existingTransactions = existingTransactionsData as DBTransaction[]

    // Map to DuplicatePair
    duplicates = duplicateImports.map(imp => {
      const existing = existingTransactions?.find(t => t.id === imp.existing_transaction_id)
      if (!existing) return null // Should not happen if referential integrity holds

      // Check for saved draft decision
      let draftDecision: 'keep_existing' | 'add_new' = 'keep_existing' // default
      if (imp.notes && imp.notes.startsWith('DRAFT:')) {
        const action = imp.notes.split(':')[1]
        if (action === 'accept') draftDecision = 'add_new'
        else if (action === 'reject') draftDecision = 'keep_existing'
      }

      return {
        importId: imp.id,
        new: mapImportToTransaction(imp, statement.currency || 'SGD'),
        existing: mapDBTransaction(existing),
        initialDecision: draftDecision,
      }
    }).filter((d) => d !== null) as DuplicatePair[]
  }

  const uiStatement: UIStatement = {
    id: statement.id,
    bankName: (statement.bank && statement.bank !== 'Unknown') ? statement.bank : (statement.source_file_name || 'Unknown Bank'),
    accountLabel: statement.account_name || undefined,
    periodStart: statement.period_start,
    periodEnd: statement.period_end,
    currency: statement.currency || 'SGD',
    transactionCount: imports.length, // Total found in this file
    status: (statement.status === 'ingesting' || statement.status === 'parsed') ? 'reviewing' : (statement.status as any),
    fileHash: statement.source_file_sha256,
    createdAt: statement.created_at,
  }

  return {
    statement: uiStatement,
    newTransactions: newImports.map(i => mapImportToTransaction(i, statement.currency || 'SGD')),
    duplicates,
  }
}

export async function confirmStatementImport(statementId: string, decisions: ImportDecisions['decisions']): Promise<{ success: boolean; error?: string }> {
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

  // Check getting user_id from the statement to assign to transactions
  const { data: statementData } = await (supabase as any).from('statements').select('uploaded_by').eq('id', statementId).single()
  if (!statementData) return { success: false, error: 'Statement not found' }

  const statement = statementData as { uploaded_by: string }

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
      })
    }
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

  // 3. Mark statement as ingested
  await (supabase as any)
    .from('statements')
    .update({ status: 'ingested' })
    .eq('id', statementId)

  return { success: true }
}

export async function getRecentStatements(): Promise<UIStatement[]> {
  const supabase = await createClient()

  const { data: statementsData, error } = await (supabase as any)
    .from('statements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error || !statementsData) {
    console.error("Failed to fetch recent statements:", error)
    return []
  }

  const statements = statementsData as DBStatement[]

  return statements.map(s => {
    let bankName = s.bank || 'Unknown Bank'
    if ((bankName === 'Unknown Bank' || !s.bank) && s.source_file_name) {
      bankName = s.source_file_name
    }

    return {
      id: s.id,
      bankName: bankName,
      accountLabel: s.account_name || undefined,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      currency: s.currency || 'SGD',
      transactionCount: 0, // TODO: Count transactions or store count on statement
      status: (s.status === 'ingesting' || s.status === 'parsed') ? 'reviewing' : (s.status as any),
      fileHash: s.source_file_sha256,
      createdAt: s.created_at,
    }
  })
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

  return { success: true }
}

export async function getStatements(): Promise<UIStatement[]> {
  const supabase = await createClient()

  const { data: statementsData, error } = await (supabase as any)
    .from('statements')
    .select('*, transactions(count)')
    .order('created_at', { ascending: false })

  if (error || !statementsData) {
    console.error("Failed to fetch statements:", error)
    return []
  }

  const statements = statementsData as (DBStatement & { transactions: { count: number }[] })[]

  return statements.map(s => {
    let bankName = s.bank || 'Unknown Bank'
    if ((bankName === 'Unknown Bank' || !s.bank) && s.source_file_name) {
      bankName = s.source_file_name
    }

    // Supabase returns count as an array of objects if simply selected? 
    // Actually .select('*, transactions(count)') with head:true or similar usually works differently.
    // But standard select returns array.
    // Let's assume the count is in the first element if it's a join, but count is tricky with standard PostgREST.
    // For now, let's just stick to the basic fetch and verify count later if needed, 
    // OR just use the same logic as getRecentStatements but try to get count properly if possible.
    // The Type Assertion above might be optimistic. 
    // Let's revert to simple fetch to be safe and match getRecentStatements style for now.

    return {
      id: s.id,
      bankName: bankName,
      accountLabel: s.account_name || undefined,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      currency: s.currency || 'SGD',
      transactionCount: s.transactions ? s.transactions[0]?.count : 0, // Placeholder-ish
      status: (s.status === 'ingesting' || s.status === 'parsed') ? 'reviewing' : (s.status as any),
      fileHash: s.source_file_sha256,
      createdAt: s.created_at,
    }
  })
}

export async function getStatementById(id: string): Promise<UIStatement | null> {
  const supabase = await createClient()

  const { data: statementData, error } = await (supabase as any)
    .from('statements')
    .select('*, transactions(count)')
    .eq('id', id)
    .single()

  if (error || !statementData) {
    return null
  }

  const s = statementData as (DBStatement & { transactions: { count: number }[] })

  let bankName = s.bank || 'Unknown Bank'
  if ((bankName === 'Unknown Bank' || !s.bank) && s.source_file_name) {
    bankName = s.source_file_name
  }

  return {
    id: s.id,
    bankName: bankName,
    accountLabel: s.account_name || undefined,
    periodStart: s.period_start,
    periodEnd: s.period_end,
    currency: s.currency || 'SGD',
    transactionCount: s.transactions ? s.transactions[0]?.count : 0,
    status: (s.status === 'ingesting' || s.status === 'parsed') ? 'reviewing' : (s.status as any),
    fileHash: s.source_file_sha256,
    createdAt: s.created_at,
  }
}
export async function getPendingStatements(): Promise<UIStatement[]> {
  const supabase = await createClient()

  const { data: statementsData, error } = await (supabase as any)
    .from('statements')
    .select('*')
    .in('status', ['parsed', 'ingesting']) // Pending statuses
    .order('created_at', { ascending: true })

  if (error || !statementsData) {
    console.error("Failed to fetch pending statements:", error)
    return []
  }

  const statements = statementsData as DBStatement[]

  // TODO: Refactor this mapping into a shared helper function as it's used in 3 places now
  return statements.map((s: DBStatement) => {
    let bankName = s.bank || 'Unknown Bank'
    if ((bankName === 'Unknown Bank' || !s.bank) && s.source_file_name) {
      bankName = s.source_file_name
    }

    return {
      id: s.id,
      bankName: bankName,
      accountLabel: s.account_name || undefined,
      periodStart: s.period_start,
      periodEnd: s.period_end,
      currency: s.currency || 'SGD',
      transactionCount: 0,
      status: (s.status === 'ingesting' || s.status === 'parsed') ? 'reviewing' : (s.status as any),
      fileHash: s.source_file_sha256,
      createdAt: s.created_at,
    }
  })
}

export async function saveDuplicateDecision(importId: string, decision: 'accept' | 'reject'): Promise<void> {
  const supabase = await createClient()

  // We store the draft decision in the 'notes' column with a prefix
  const noteContent = `DRAFT:${decision}`

  const { error } = await (supabase as any)
    .from('transaction_imports')
    .update({ notes: noteContent })
    .eq('id', importId)

  if (error) {
    console.error(`Failed to save duplicate decision for ${importId}:`, error)
    throw new Error('Failed to save decision')
  }
}

// ... existing code ...
