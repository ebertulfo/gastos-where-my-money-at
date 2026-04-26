export type InsightsPeriod =
  | { type: 'statement'; statementId: string }
  | { type: 'month'; month: string }   // 'YYYY-MM'
  | { type: 'year'; year: string }     // 'YYYY'

export type InsightsTravelMode = 'all' | 'travel' | 'no-travel'

export interface InsightsFilters {
  /** When non-empty, restrict to transactions on statements attributed to ANY of these members. */
  memberIds: string[]
  /** 'all' = no filter; 'travel' = only is_travel rows; 'no-travel' = only non-travel. */
  travelMode: InsightsTravelMode
}

export interface TagBreakdownRow {
  tagId: string | null
  tagName: string
  tagColor: string | null
  amount: number
  percentage: number
  count: number
}

export interface MemberBreakdownRow {
  memberId: string
  memberName: string
  memberColor: string | null
  /** Total spend on statements attributed to this member, regardless of joint status. */
  amount: number
  count: number
  /** Subset of `amount` that came from joint statements (statements attributed to ≥2 members). */
  jointAmount: number
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
  /** Top-level category rollup (Food includes groceries+dining+...). Despite the field name, these rows now describe categories, not free-form labels. */
  tagBreakdown: TagBreakdownRow[]
  topMerchants: MerchantRow[]
  /** Per-member rollup. A joint statement's transactions count for each attributed member, so the sum across rows can exceed `totalSpent`. */
  memberBreakdown: MemberBreakdownRow[]
  /** Count of transactions where category_source='ai' (AI-applied, not yet user-confirmed). */
  aiCategorizedCount: number
  /** Count of transactions with any category assigned (user OR ai). */
  categorizedCount: number
  /** Sum of amounts where is_travel=true within the current view's filter. */
  travelSpent: number
  /** Count of is_travel=true transactions within the current view's filter. */
  travelTransactionCount: number
}
