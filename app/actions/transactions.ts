'use server'

import { createServerClient } from '@/lib/supabase/client'
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
    createdAt: t.created_at,
  }
}


export async function getTransactions(month?: string | null, statementId?: string): Promise<Transaction[]> {
  const supabase = createServerClient()
  
  let query = (supabase as any)
    .from('transactions')
    .select('*, statements(bank, period_start, source_file_name)')
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
  const supabase = createServerClient()
  
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
  const supabase = createServerClient()
  
  let query = (supabase as any)
    .from('transactions')
    .select('amount, statement_id')
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

  const transactions = data as { amount: number; statement_id: string }[]
  
  const totalSpent = transactions
    .filter(t => t.amount > 0) // Assuming positive for expenses based on "Gastos" context and parsed data
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

export async function getStatementsForMonth(month: string): Promise<{ id: string; label: string }[]> {
  const supabase = createServerClient()
  
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
