export interface TagSuggestion {
  tagId: string
  confidence: number
  source: 'knn' | 'llm' | 'mixed'
}

export interface NeighbourTag {
  tagId: string
  isPrimary: boolean
}

export interface NeighbourRow {
  transactionId: string
  description: string
  similarity: number
  tags: NeighbourTag[]
}

export interface TagNode {
  id: string
  name: string
  parentId: string | null
  color: string | null
}
