export type InsightsPeriod =
  | { type: 'statement'; statementId: string }
  | { type: 'month'; month: string }   // 'YYYY-MM'
  | { type: 'year'; year: string }     // 'YYYY'

export interface TagBreakdownRow {
  tagId: string | null
  tagName: string
  tagColor: string | null
  amount: number
  percentage: number
  count: number
}

export interface MerchantRow {
  description: string
  amount: number
  count: number
}

export interface Insights {
  periodLabel: string
  currency: string
  totalSpent: number
  transactionCount: number
  statementCount: number
  tagBreakdown: TagBreakdownRow[]
  topMerchants: MerchantRow[]
}
