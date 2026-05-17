'use server'

import { getTransactions, getMonthSummary } from './transactions'
import { getTags } from './tags'
import { Transaction, MonthSummary } from '@/lib/types/transaction'
import type { Tag } from '@/db/schema'

export interface TransactionData {
  transactions: Transaction[]
  summary: MonthSummary
  tags: Tag[]
}

export async function refreshTransactionData(
  month: string | null,
  statementId?: string
): Promise<TransactionData> {
  const [transactions, summary, tags] = await Promise.all([
    getTransactions(month, statementId),
    getMonthSummary(month, statementId),
    getTags(),
  ])

  return {
    transactions,
    summary,
    tags,
  }
}
