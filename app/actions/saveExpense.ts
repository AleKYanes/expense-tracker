'use server'

import { getServerClient } from '@/app/lib/supabase/server'
import { normalize } from '@/app/lib/categoryMatcher'
import type { SaveExpenseInput } from '@/app/lib/types'

function serverMatch(
  descriptions: (string | null | undefined)[],
  rules: Array<{ category_id: string; match_text: string; priority?: number }>
): string | null {
  let bestCatId: string | null = null
  let bestPriority = -1
  let bestLen = 0

  for (const text of descriptions) {
    if (!text) continue
    const n = normalize(text)
    for (const rule of rules) {
      if (!rule.match_text) continue
      const ruleNorm = normalize(rule.match_text)
      if (!n.includes(ruleNorm)) continue
      const priority = rule.priority ?? 100
      const len = ruleNorm.length
      if (priority > bestPriority || (priority === bestPriority && len > bestLen)) {
        bestCatId = rule.category_id
        bestPriority = priority
        bestLen = len
      }
    }
  }
  return bestCatId
}

function blankToNull(v: string | null | undefined): string | null {
  if (!v || !v.trim()) return null
  return v
}

export async function saveExpense(
  input: SaveExpenseInput
): Promise<{ id: string } | { error: string }> {
  let supabase
  try {
    supabase = await getServerClient()
  } catch {
    return { error: 'Database is not configured. Add Supabase environment variables to .env.local.' }
  }

  // Get authenticated user — required for RLS.
  const { data: { user } } = await supabase.auth.getUser()

  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .insert({
      vendor_name: input.vendor_name,
      invoice_number: input.invoice_number || null,
      invoice_date: input.invoice_date || null,
      total_amount: input.total_amount,
      tax_amount: input.tax_amount,
      currency: input.currency || 'CZK',
      category_id: blankToNull(input.category_id),
      status: 'reviewed',
      source_file_name: input.source_file_name,
      raw_extraction_json: input.raw_extraction_json,
      confidence_score: input.confidence_score,
      user_id: user?.id ?? null,
    })
    .select('id')
    .single()

  if (expenseError || !expense) {
    return { error: expenseError?.message ?? 'Failed to save expense.' }
  }

  if (input.items.length === 0) return { id: expense.id }

  const [catRes, rulesRes] = await Promise.all([
    supabase.from('categories').select('id, slug, name'),
    supabase.from('category_rules').select('category_id, match_text, priority'),
  ])

  if (catRes.error) console.error('[saveExpense] categories fetch error:', catRes.error.message)
  if (rulesRes.error) console.error('[saveExpense] rules fetch error:', rulesRes.error.message)

  const serverCategories = catRes.data ?? []
  const serverRules = rulesRes.data ?? []
  const otherCategoryId = serverCategories.find((c) => c.slug === 'other')?.id ?? null

  const rows = input.items
    .filter((item) => item.description.trim())
    .map((item) => {
      const amount =
        item.amount ??
        (item.unit_price != null ? (item.quantity ?? 1) * item.unit_price : null)

      const clientCat = blankToNull(item.category_id)
      const matchedCat = clientCat ?? serverMatch(
        [item.description, item.translated_description],
        serverRules
      )
      const finalCategoryId = matchedCat ?? otherCategoryId

      return {
        expense_id: expense.id,
        description: item.description,
        quantity: item.quantity ?? (item.unit_price != null ? 1 : null),
        unit_price: item.unit_price,
        amount,
        tax_amount: item.tax_amount,
        category_id: finalCategoryId,
        confidence_score: item.confidence_score,
      }
    })

  const { error: itemsError } = await supabase.from('expense_items').insert(rows)

  if (itemsError) {
    console.error('[saveExpense] failed to insert line items:', itemsError.message)
  }

  return { id: expense.id }
}
