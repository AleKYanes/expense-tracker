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
 * Returns the best-matching rule for a single text string.
 * Scoring: priority (higher wins), then match_text length on ties.
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

/**
 * Like matchCategory, but tries multiple text strings (e.g. original + translated)
 * and returns the single best match across all of them.
 */
export function matchCategoryFromTexts(
  texts: (string | null | undefined)[],
  rules: CategoryRule[]
): MatchResult | null {
  let best: MatchResult | null = null

  for (const text of texts) {
    if (!text) continue
    const m = matchCategory(text, rules)
    if (!m) continue
    if (
      !best ||
      m.priority > best.priority ||
      (m.priority === best.priority && m.match_text.length > (best.match_text.length))
    ) {
      best = m
    }
  }

  return best
}

export function suggestCategoryId(text: string, rules: CategoryRule[]): string | null {
  return matchCategory(text, rules)?.category_id ?? null
}

/**
 * Suggest a category by trying multiple texts (original + translated).
 * Use this wherever a translated_description may be available.
 */
export function suggestCategoryIdFromTexts(
  texts: (string | null | undefined)[],
  rules: CategoryRule[]
): string | null {
  return matchCategoryFromTexts(texts, rules)?.category_id ?? null
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
