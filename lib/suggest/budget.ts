import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { userSettings } from '@/db/schema'

export type BudgetCheck =
  | { allowed: true }
  | { allowed: false; reason: 'disabled' | 'budget_exceeded' | 'no_settings' }

function isSameUtcMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}

/**
 * Checks if the user can make another AI call. Resets the monthly spend
 * counter if the calendar month rolled over since `ai_budget_reset_at`.
 */
export async function checkBudget(userId: string): Promise<BudgetCheck> {
  const [settings] = await db
    .select({
      autoTagEnabled: userSettings.autoTagEnabled,
      aiMonthlyBudgetCents: userSettings.aiMonthlyBudgetCents,
      aiSpentThisMonthCents: userSettings.aiSpentThisMonthCents,
      aiBudgetResetAt: userSettings.aiBudgetResetAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)

  if (!settings) {
    return { allowed: false, reason: 'no_settings' }
  }

  if (!settings.autoTagEnabled) {
    return { allowed: false, reason: 'disabled' }
  }

  const now = new Date()
  const lastReset = new Date(settings.aiBudgetResetAt)
  if (!isSameUtcMonth(now, lastReset)) {
    await db
      .update(userSettings)
      .set({
        aiSpentThisMonthCents: 0,
        aiBudgetResetAt: now,
      })
      .where(eq(userSettings.userId, userId))
    return { allowed: true }
  }

  if (settings.aiSpentThisMonthCents >= settings.aiMonthlyBudgetCents) {
    return { allowed: false, reason: 'budget_exceeded' }
  }

  return { allowed: true }
}

/**
 * Atomically increments the user's monthly AI spend by `cents`. Best-effort.
 */
export async function incrementSpend(userId: string, cents: number): Promise<void> {
  if (cents <= 0) return

  try {
    const [row] = await db
      .select({ current: userSettings.aiSpentThisMonthCents })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1)

    if (!row) return

    await db
      .update(userSettings)
      .set({ aiSpentThisMonthCents: (row.current ?? 0) + cents })
      .where(eq(userSettings.userId, userId))
  } catch {
    console.warn('Failed to increment AI spend')
  }
}
