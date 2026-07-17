import { describe, it, expect } from 'vitest'
import { suggestOverallCategory } from '../categoryMatcher'
import type { CategoryRule } from '../types'

const rules: CategoryRule[] = [
  { category_id: 'groceries', match_text: 'velka pecka', priority: 500 },
  { category_id: 'protein', match_text: 'chicken', priority: 200 },
  { category_id: 'protein', match_text: 'tofu', priority: 200 },
  { category_id: 'household', match_text: 'toilet paper', priority: 200 },
  { category_id: 'alcohol', match_text: 'wine', priority: 200 },
]

function item(text: string, amount: number | null) {
  return { texts: [text], amount }
}

describe('suggestOverallCategory', () => {
  it('vendor rule wins outright, ignoring items', () => {
    const result = suggestOverallCategory(
      'VELKÁ PECKA s.r.o.',
      [item('chicken breast', 500), item('wine', 100)],
      rules
    )
    expect(result).toBe('groceries')
  })

  it('vendor matching is diacritics-insensitive', () => {
    expect(suggestOverallCategory('Velká Pecka', [], rules)).toBe('groceries')
  })

  it('weights the vote by amount, not item count', () => {
    // Three cheap protein items vs one expensive wine: wine must win.
    const result = suggestOverallCategory(
      'Unknown Vendor',
      [
        item('chicken wings', 30),
        item('chicken soup', 30),
        item('tofu natural', 30),
        item('wine cabernet', 900),
      ],
      rules
    )
    expect(result).toBe('alcohol')
  })

  it('returns null when no category reaches the minimum share', () => {
    // Four categories at ~25% each — no honest winner.
    const result = suggestOverallCategory(
      'Unknown Vendor',
      [
        item('chicken breast', 100),
        item('toilet paper', 100),
        item('wine', 100),
        item('unmatched thing', 100),
      ],
      rules
    )
    expect(result).toBeNull()
  })

  it('falls back to counting items when no amounts are known', () => {
    const result = suggestOverallCategory(
      'Unknown Vendor',
      [item('chicken breast', null), item('chicken soup', null), item('wine', null)],
      rules
    )
    expect(result).toBe('protein')
  })

  it('uses translated descriptions too', () => {
    const result = suggestOverallCategory(
      'Unknown Vendor',
      [{ texts: ['kuřecí prsa', 'chicken breast'], amount: 200 }],
      rules
    )
    expect(result).toBe('protein')
  })

  it('returns null for an empty expense', () => {
    expect(suggestOverallCategory('Unknown Vendor', [], rules)).toBeNull()
  })
})
