import { describe, it, expect } from 'vitest'
import { matchCategory, ruleMatches, suggestOverallCategory } from '../categoryMatcher'
import type { CategoryRule } from '../types'

describe('ruleMatches (word boundaries for short rules)', () => {
  it('matches short rules only as whole words', () => {
    expect(ruleMatches('inaba churu bites cat snack chicken', 'cat')).toBe(true)
    expect(ruleMatches('muscat wine 0.75l', 'cat')).toBe(false)
    expect(ruleMatches('delicatessen platter', 'cat')).toBe(false)
    expect(ruleMatches('cat food 2kg', 'cat')).toBe(true)
  })

  it("no longer matches 'lek' inside 'mlekarna'", () => {
    expect(ruleMatches('bohusovicka mlekarna skyr 0,1% 350g', 'lek')).toBe(false)
    expect(ruleMatches('lek na bolest', 'lek')).toBe(true)
  })

  it('keeps substring matching for longer rules (stems)', () => {
    expect(ruleMatches('cokoladova tycinka', 'cokolad')).toBe(true)
  })
})

describe('matchCategory with short rules', () => {
  const shortRules: CategoryRule[] = [
    { category_id: 'pets', match_text: 'cat', priority: 600 },
    { category_id: 'protein', match_text: 'chicken', priority: 200 },
  ]

  it("sends cat products to pets even when protein keywords are present", () => {
    const m = matchCategory('Inaba Churu Bites Cat Snack chicken, tuna, salmon', shortRules)
    expect(m?.category_id).toBe('pets')
  })

  it('does not send Muscat wine to pets', () => {
    expect(matchCategory('Muscat semi-sweet 0.75l', shortRules)).toBeNull()
  })
})

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
