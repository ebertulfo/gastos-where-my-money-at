'use server'

import { createClient } from '@/lib/supabase/server'
import { Transaction, MonthSummary } from '@/lib/types/transaction'
import { Database } from '@/lib/supabase/database.types'

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
  
  const { error } = await (supabase.from('transactions') as any)
    .update({ 
        is_excluded: isExcluded,
        exclusion_reason: isExcluded ? reason : null 
    })
    .eq('id', id)
    
  if (error) {
    console.error('Failed to update transaction exclusion:', error)
    throw new Error('Failed to update transaction')
  }
  
  return { success: true }
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
