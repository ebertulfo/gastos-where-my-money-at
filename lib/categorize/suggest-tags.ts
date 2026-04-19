import pLimit from 'p-limit'
import { createServerClient } from '@/lib/supabase/client'
import { sanitizeDescription } from '@/lib/pdf/types'
import {
  CATEGORIZE_MODEL,
  estimateUsageCents,
  getAnthropicClient,
  type UsageTokens,
} from './client'
import { buildSystemPrompt, buildUserPrompt, SUGGEST_TAGS_TOOL_INPUT_SCHEMA, SUGGEST_TAGS_TOOL_NAME } from './prompts'
import { checkBudget, incrementSpend } from './budget'
import type {
  SuggestionInputRow,
  SuggestionResultRow,
  SuggestionStatus,
  TagVocabularyEntry,
} from './types'

const BATCH_SIZE = 50

// Cap concurrent Anthropic calls across the whole process. Bulk uploads
// would otherwise fan out one in-flight call per statement, hitting the
// per-org rate limit.
const limiter = pLimit(2)

interface RawSuggestion {
  tempId: string
  tagIds: string[]
}

interface SuggestBatchResult {
  results: SuggestionResultRow[]
  modelVersion: string
  usageCents: number
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function suggestBatch(
  rows: SuggestionInputRow[],
  tags: TagVocabularyEntry[]
): Promise<SuggestBatchResult> {
  const client = getAnthropicClient()
  if (!client) {
    throw new Error('No Anthropic client configured')
  }

  const validTagIds = new Set(tags.map(t => t.id))

  const response = await client.messages.create({
    model: CATEGORIZE_MODEL,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: buildSystemPrompt(tags),
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: SUGGEST_TAGS_TOOL_NAME,
        description: 'Record suggested tag IDs for each input transaction.',
        input_schema: SUGGEST_TAGS_TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: SUGGEST_TAGS_TOOL_NAME },
    messages: [
      { role: 'user', content: buildUserPrompt(rows) },
    ],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('No tool_use block in response')
  }

  const raw = (toolUse.input as { suggestions?: RawSuggestion[] })?.suggestions ?? []

  // Strip any IDs the model hallucinated outside the vocabulary. Map by
  // tempId so we always emit one row per input even if the model skipped
  // some.
  const byTempId = new Map<string, string[]>()
  for (const s of raw) {
    const filtered = (s.tagIds ?? []).filter(id => validTagIds.has(id))
    byTempId.set(s.tempId, filtered)
  }

  const results: SuggestionResultRow[] = rows.map(r => ({
    tempId: r.tempId,
    suggestedTagIds: byTempId.get(r.tempId) ?? [],
  }))

  const usage = response.usage as unknown as Partial<UsageTokens & { cache_read_input_tokens?: number; cache_creation_input_tokens?: number; input_tokens: number; output_tokens: number }>
  const usageCents = estimateUsageCents({
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
  })

  return {
    results,
    modelVersion: response.model,
    usageCents,
  }
}

export interface SuggestForStatementResult {
  status: SuggestionStatus
  reason?: string
}

/**
 * End-to-end: read pending imports for the statement, call the LLM in
 * batches, and write results back to `transaction_imports`. Designed to
 * be called from the ingest route's after() hook — never throws.
 */
export async function suggestTagsForStatement(statementId: string): Promise<SuggestForStatementResult> {
  return limiter(async () => {
    try {
      const supabase = createServerClient()

      const { data: stmt, error: stmtErr } = await (supabase as any)
        .from('statements')
        .select('uploaded_by')
        .eq('id', statementId)
        .single()

      if (stmtErr || !stmt) {
        return { status: 'failed', reason: 'statement_not_found' }
      }
      const userId = (stmt as { uploaded_by: string }).uploaded_by

      const { data: tagsData, error: tagsErr } = await (supabase as any)
        .from('tags')
        .select('id, name, color, parent_id')
        .eq('user_id', userId)

      if (tagsErr) {
        await markStatementImportsStatus(statementId, 'failed')
        return { status: 'failed', reason: 'tag_fetch_failed' }
      }

      const allTags = (tagsData ?? []) as { id: string; name: string; color: string | null; parent_id: string | null }[]
      if (allTags.length === 0) {
        await markStatementImportsStatus(statementId, 'skipped')
        return { status: 'skipped', reason: 'no_tags' }
      }

      const tagsById = new Map(allTags.map(t => [t.id, t]))
      const vocabulary: TagVocabularyEntry[] = allTags.map(t => ({
        id: t.id,
        name: t.name,
        color: t.color,
        parentName: t.parent_id ? (tagsById.get(t.parent_id)?.name ?? null) : null,
      }))

      const budget = await checkBudget(userId)
      if (!budget.allowed) {
        const status: SuggestionStatus = budget.reason === 'disabled' ? 'disabled' : 'skipped'
        await markStatementImportsStatus(statementId, status)
        return { status, reason: budget.reason }
      }

      const { data: importsData, error: importsErr } = await (supabase as any)
        .from('transaction_imports')
        .select('id, date, description, amount')
        .eq('statement_id', statementId)
        .eq('ai_suggestion_status', 'pending')

      if (importsErr) {
        await markStatementImportsStatus(statementId, 'failed')
        return { status: 'failed', reason: 'import_fetch_failed' }
      }

      const imports = (importsData ?? []) as { id: string; date: string; description: string; amount: number }[]
      if (imports.length === 0) {
        return { status: 'completed' }
      }

      const rows: SuggestionInputRow[] = imports.map(i => ({
        tempId: i.id,
        date: i.date,
        description: sanitizeDescription(i.description),
        amount: i.amount,
      }))

      const client = getAnthropicClient()
      if (!client) {
        await markStatementImportsStatus(statementId, 'disabled')
        return { status: 'disabled', reason: 'no_api_key' }
      }

      const batches = chunk(rows, BATCH_SIZE)
      const completedAt = new Date().toISOString()
      let totalCents = 0
      let modelVersion = ''

      for (const batch of batches) {
        try {
          const { results, modelVersion: mv, usageCents } = await suggestBatch(batch, vocabulary)
          totalCents += usageCents
          modelVersion = mv

          // Persist suggestions for this batch.
          await Promise.all(results.map(async (r) => {
            await (supabase as any)
              .from('transaction_imports')
              .update({
                suggested_tag_ids: r.suggestedTagIds,
                ai_suggestion_status: 'completed',
                ai_model_version: mv,
                ai_suggested_at: completedAt,
              })
              .eq('id', r.tempId)
          }))
        } catch (err) {
          console.warn(`AI tagging batch failed for statement ${statementId}`)
          // Mark only this batch's rows as failed; subsequent batches keep trying.
          await Promise.all(batch.map(async (r) => {
            await (supabase as any)
              .from('transaction_imports')
              .update({
                ai_suggestion_status: 'failed',
                ai_model_version: modelVersion || null,
                ai_suggested_at: completedAt,
              })
              .eq('id', r.tempId)
          }))
        }
      }

      if (totalCents > 0) {
        await incrementSpend(userId, totalCents)
      }

      return { status: 'completed' }
    } catch (err) {
      console.warn('suggestTagsForStatement crashed')
      return { status: 'failed', reason: 'unexpected_error' }
    }
  })
}

async function markStatementImportsStatus(statementId: string, status: SuggestionStatus) {
  const supabase = createServerClient()
  await (supabase as any)
    .from('transaction_imports')
    .update({ ai_suggestion_status: status, ai_suggested_at: new Date().toISOString() })
    .eq('statement_id', statementId)
    .eq('ai_suggestion_status', 'pending')
}
