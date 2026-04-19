export type SuggestionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'disabled'

export interface SuggestionInputRow {
  tempId: string
  date: string
  description: string
  amount: number
}

export interface TagVocabularyEntry {
  id: string
  name: string
  parentName: string | null
  color: string | null
}

export interface SuggestionRequest {
  rows: SuggestionInputRow[]
  tags: TagVocabularyEntry[]
}

export interface SuggestionResultRow {
  tempId: string
  suggestedTagIds: string[]
}

export interface SuggestionResponse {
  results: SuggestionResultRow[]
  modelVersion: string
  usageCents: number
}

export interface ImportSuggestionRecord {
  importId: string
  suggestedTagIds: string[]
  status: SuggestionStatus
}
