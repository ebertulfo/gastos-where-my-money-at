import type { SuggestionInputRow, TagVocabularyEntry } from './types'

export const SUGGEST_TAGS_TOOL_NAME = 'record_suggested_tags'

export const SUGGEST_TAGS_TOOL_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    suggestions: {
      type: 'array' as const,
      description: 'One entry per input transaction, in the same order they were provided.',
      items: {
        type: 'object' as const,
        properties: {
          tempId: {
            type: 'string' as const,
            description: 'The tempId from the input transaction.',
          },
          tagIds: {
            type: 'array' as const,
            description: 'IDs of tags from the provided vocabulary. Empty array if no tag fits.',
            items: { type: 'string' as const },
          },
        },
        required: ['tempId', 'tagIds'],
      },
    },
  },
  required: ['suggestions'],
}

function renderTagVocabulary(tags: TagVocabularyEntry[]): string {
  // Group by parent so the model sees the hierarchy explicitly.
  const byParent = new Map<string | null, TagVocabularyEntry[]>()
  for (const tag of tags) {
    const key = tag.parentName
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(tag)
  }

  const lines: string[] = []
  // Top-level (parents with no parent themselves) appear first; their children
  // are listed beneath them.
  const parentNames = tags
    .filter(t => !t.parentName)
    .map(t => t.name)
    .sort()
  for (const parentName of parentNames) {
    const parent = tags.find(t => t.name === parentName && !t.parentName)
    if (!parent) continue
    const children = byParent.get(parentName) ?? []
    if (children.length > 0) {
      const childList = children
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => `${c.name} (${c.id})`)
        .join(', ')
      lines.push(`- ${parent.name} (${parent.id}): ${childList}`)
    } else {
      lines.push(`- ${parent.name} (${parent.id})`)
    }
  }

  // Orphan tags (no parent and not already listed as a parent above).
  const orphans = (byParent.get(null) ?? [])
    .filter(t => !parentNames.includes(t.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const orphan of orphans) {
    lines.push(`- ${orphan.name} (${orphan.id})`)
  }

  return lines.join('\n')
}

export function buildSystemPrompt(tags: TagVocabularyEntry[]): string {
  return `You are a personal finance categorisation assistant.

The user maintains the following tags. You MUST pick from these tag IDs only — never invent or reword them.

${renderTagVocabulary(tags)}

Rules:
1. Pick the MOST SPECIFIC tag (prefer a child tag over its parent — e.g. "Coffee" over "Food").
2. Pick MULTIPLE tags only when a transaction genuinely belongs to two distinct categories.
3. Return tag IDs (the UUIDs in parentheses), not names.
4. If no tag fits, return an empty array. Do not guess.
5. Never invent IDs. Only use IDs that appear in the vocabulary above.

Use the ${SUGGEST_TAGS_TOOL_NAME} tool to record your suggestions.`
}

export function buildUserPrompt(rows: SuggestionInputRow[]): string {
  const payload = {
    transactions: rows.map(r => ({
      tempId: r.tempId,
      date: r.date,
      description: r.description,
      amount: r.amount,
    })),
  }
  return `Categorise these transactions:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``
}
