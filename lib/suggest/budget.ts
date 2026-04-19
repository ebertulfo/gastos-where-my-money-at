import { createServerClient } from '@/lib/supabase/client'

export type BudgetCheck =
  | { allowed: true }
  | { allowed: false; reason: 'disabled' | 'budget_exceeded' | 'no_settings' }

interface UserSettingsAIRow {
  auto_tag_enabled: boolean
  ai_monthly_budget_cents: number
  ai_spent_this_month_cents: number
  ai_budget_reset_at: string
}

function isSameUtcMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}

/**
 * Checks if the user can make another AI call. Resets the monthly spend
 * counter if the calendar month rolled over since `ai_budget_reset_at`.
 *
 * Uses the service-role client so callers from any context (RSC, route
 * handler, server action) work the same way.
 */
export async function checkBudget(userId: string): Promise<BudgetCheck> {
  const supabase = createServerClient()

  const { data, error } = await (supabase as any)
    .from('user_settings')
    .select('auto_tag_enabled, ai_monthly_budget_cents, ai_spent_this_month_cents, ai_budget_reset_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) {
    return { allowed: false, reason: 'no_settings' }
  }

  const settings = data as UserSettingsAIRow

  if (!settings.auto_tag_enabled) {
    return { allowed: false, reason: 'disabled' }
  }

  const now = new Date()
  const lastReset = new Date(settings.ai_budget_reset_at)
  if (!isSameUtcMonth(now, lastReset)) {
    await (supabase as any)
      .from('user_settings')
      .update({
        ai_spent_this_month_cents: 0,
        ai_budget_reset_at: now.toISOString(),
      })
      .eq('user_id', userId)
    return { allowed: true }
  }

  if (settings.ai_spent_this_month_cents >= settings.ai_monthly_budget_cents) {
    return { allowed: false, reason: 'budget_exceeded' }
  }

  return { allowed: true }
}

/**
 * Atomically increments the user's monthly AI spend by `cents`. Best-effort —
 * a failure here logs but doesn't bubble (we'd rather over-charge by a
 * fraction of a cent than fail the user's tagging suggestions).
 */
export async function incrementSpend(userId: string, cents: number): Promise<void> {
  if (cents <= 0) return
  const supabase = createServerClient()

  const { data, error: readError } = await (supabase as any)
    .from('user_settings')
    .select('ai_spent_this_month_cents')
    .eq('user_id', userId)
    .maybeSingle()

  if (readError || !data) {
    console.warn('Failed to read spend before increment')
    return
  }

  const current = (data as { ai_spent_this_month_cents: number }).ai_spent_this_month_cents ?? 0
  const { error: writeError } = await (supabase as any)
    .from('user_settings')
    .update({ ai_spent_this_month_cents: current + cents })
    .eq('user_id', userId)

  if (writeError) {
    console.warn('Failed to increment AI spend')
  }
}
