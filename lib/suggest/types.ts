export interface TagSuggestion {
  tagId: string
  confidence: number
  // 'tag-embed' = surfaced by cosine similarity between the transaction
  // embedding and tag embeddings (name+description). 'mixed' = supported
  // by more than one signal.
  source: 'knn' | 'llm' | 'mixed' | 'tag-embed'
}

export interface TagEmbedCandidate {
  tagId: string
  name: string
  similarity: number
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
