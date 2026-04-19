import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, buildUserPrompt, SUGGEST_TAGS_TOOL_INPUT_SCHEMA } from '../prompts'
import type { SuggestionInputRow, TagVocabularyEntry } from '../types'

describe('buildSystemPrompt', () => {
  it('renders parent tags with their children inline', () => {
    const tags: TagVocabularyEntry[] = [
      { id: 'food-id', name: 'Food', color: '#f97316', parentName: null },
      { id: 'coffee-id', name: 'Coffee', color: null, parentName: 'Food' },
      { id: 'groceries-id', name: 'Groceries', color: null, parentName: 'Food' },
      { id: 'transport-id', name: 'Transport', color: '#eab308', parentName: null },
      { id: 'taxi-id', name: 'Taxi/Ride', color: null, parentName: 'Transport' },
    ]

    const prompt = buildSystemPrompt(tags)

    expect(prompt).toContain('Food (food-id)')
    expect(prompt).toContain('Coffee (coffee-id)')
    expect(prompt).toContain('Groceries (groceries-id)')
    expect(prompt).toContain('Transport (transport-id)')
    expect(prompt).toContain('Taxi/Ride (taxi-id)')
  })

  it('lists orphan tags (no parent and no children) at the end', () => {
    const tags: TagVocabularyEntry[] = [
      { id: 'food-id', name: 'Food', color: null, parentName: null },
      { id: 'coffee-id', name: 'Coffee', color: null, parentName: 'Food' },
      { id: 'misc-id', name: 'Misc', color: null, parentName: null },
    ]

    const prompt = buildSystemPrompt(tags)
    const foodIdx = prompt.indexOf('Food (food-id)')
    const miscIdx = prompt.indexOf('Misc (misc-id)')
    expect(foodIdx).toBeGreaterThan(-1)
    expect(miscIdx).toBeGreaterThan(foodIdx)
  })

  it('forbids inventing tag IDs', () => {
    const prompt = buildSystemPrompt([])
    expect(prompt.toLowerCase()).toContain('never invent ids')
  })
})

describe('buildUserPrompt', () => {
  it('serialises rows as JSON inside a fenced block', () => {
    const rows: SuggestionInputRow[] = [
      { tempId: 'imp_1', date: '2026-04-15', description: 'STARBUCKS #4521', amount: 7.5 },
      { tempId: 'imp_2', date: '2026-04-15', description: 'GRAB*RIDE', amount: 18.2 },
    ]
    const prompt = buildUserPrompt(rows)

    expect(prompt).toContain('```json')
    expect(prompt).toContain('"tempId": "imp_1"')
    expect(prompt).toContain('"description": "STARBUCKS #4521"')
    expect(prompt).toContain('"amount": 7.5')
  })
})

describe('SUGGEST_TAGS_TOOL_INPUT_SCHEMA', () => {
  it('requires tempId and tagIds on each suggestion', () => {
    const itemSchema = SUGGEST_TAGS_TOOL_INPUT_SCHEMA.properties.suggestions.items
    expect(itemSchema.required).toEqual(['tempId', 'tagIds'])
    expect(itemSchema.properties.tagIds.type).toBe('array')
  })
})
