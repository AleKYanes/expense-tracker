import type { CategoryRule } from './types'

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export type MatchResult = {
  category_id: string
  match_text: string
  priority: number
}

/**
 * Returns the best-matching rule for the given text using a two-key score:
 *   1. Priority (explicit DB column, default 100)  — higher wins
 *   2. Match-text length                           — longer wins on ties
 *
 * This avoids the "first row from DB wins" problem and makes specific rules
 * (e.g. "kuřecí prsní") beat general ones (e.g. "protein").
 */
export function matchCategory(text: string, rules: CategoryRule[]): MatchResult | null {
  if (!text || !rules.length) return null
  const n = normalize(text)
  let best: MatchResult | null = null
  let bestLen = 0

  for (const rule of rules) {
    if (!rule.match_text) continue
    const ruleNorm = normalize(rule.match_text)
    if (!n.includes(ruleNorm)) continue

    const priority = rule.priority ?? 100
    const len = ruleNorm.length

    const isBetter =
      !best ||
      priority > best.priority ||
      (priority === best.priority && len > bestLen)

    if (isBetter) {
      best = { category_id: rule.category_id, match_text: rule.match_text, priority }
      bestLen = len
    }
  }

  return best
}

export function suggestCategoryId(text: string, rules: CategoryRule[]): string | null {
  return matchCategory(text, rules)?.category_id ?? null
}

export function suggestOverallCategory(
  vendorName: string,
  itemDescriptions: string[],
  rules: CategoryRule[]
): string | null {
  const fromVendor = suggestCategoryId(vendorName, rules)
  if (fromVendor) return fromVendor

  const counts: Record<string, number> = {}
  for (const desc of itemDescriptions) {
    const id = suggestCategoryId(desc, rules)
    if (id) counts[id] = (counts[id] ?? 0) + 1
  }

  let best: string | null = null
  let bestCount = 0
  for (const [id, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = id
      bestCount = count
    }
  }
  return best
}
