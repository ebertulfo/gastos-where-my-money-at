import { describe, expect, it } from 'vitest'
import { collapseHierarchy } from '../suggest'
import type { TagNode, TagSuggestion } from '../types'

describe('collapseHierarchy', () => {
  const tags: TagNode[] = [
    { id: 'food', name: 'Food', parentId: null, color: null },
    { id: 'coffee', name: 'Coffee', parentId: 'food', color: null },
    { id: 'groceries', name: 'Groceries', parentId: 'food', color: null },
    { id: 'transport', name: 'Transport', parentId: null, color: null },
    { id: 'taxi', name: 'Taxi', parentId: 'transport', color: null },
    // Three-deep chain to test transitive collapse.
    { id: 'living', name: 'Living', parentId: null, color: null },
    { id: 'utilities', name: 'Utilities', parentId: 'living', color: null },
    { id: 'internet', name: 'Internet', parentId: 'utilities', color: null },
  ]

  function s(tagId: string, confidence: number, source: TagSuggestion['source'] = 'knn'): TagSuggestion {
    return { tagId, confidence, source }
  }

  it('drops parent when its child also scores', () => {
    const out = collapseHierarchy([s('coffee', 1), s('food', 0.5)], tags)
    expect(out.map(o => o.tagId)).toEqual(['coffee'])
  })

  it('keeps both when tags are unrelated', () => {
    const out = collapseHierarchy([s('coffee', 1), s('taxi', 0.7)], tags)
    expect(out.map(o => o.tagId)).toEqual(['coffee', 'taxi'])
  })

  it('preserves order of confidence', () => {
    const out = collapseHierarchy([s('taxi', 0.9), s('coffee', 0.6), s('groceries', 0.4)], tags)
    expect(out.map(o => o.tagId)).toEqual(['taxi', 'coffee', 'groceries'])
  })

  it('transitively drops grandparent when grandchild scores', () => {
    const out = collapseHierarchy([s('internet', 1), s('living', 0.7), s('utilities', 0.5)], tags)
    expect(out.map(o => o.tagId)).toEqual(['internet'])
  })

  it('keeps a parent when no child scores', () => {
    const out = collapseHierarchy([s('food', 1), s('transport', 0.7)], tags)
    expect(out.map(o => o.tagId)).toEqual(['food', 'transport'])
  })

  it('handles empty input', () => {
    expect(collapseHierarchy([], tags)).toEqual([])
  })

  it('does not crash on a tag with no parent (orphan)', () => {
    const orphan = [...tags, { id: 'orphan', name: 'Orphan', parentId: null, color: null } satisfies TagNode]
    const out = collapseHierarchy([s('orphan', 1), s('coffee', 0.5)], orphan)
    expect(out.map(o => o.tagId)).toEqual(['orphan', 'coffee'])
  })
})
