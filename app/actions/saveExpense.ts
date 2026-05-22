'use server'

import { getServerClient } from '@/app/lib/supabase/server'
import { normalize } from '@/app/lib/categoryMatcher'
import type { SaveExpenseInput } from '@/app/lib/types'

// Inline matcher — runs server-side so we don't depend on client state.
function serverMatch(
  description: string,
  rules: Array<{ category_id: string; match_text: string }>
): string | null {
  if (!description || !rules.length) return null
  const n = normalize(description)
  for (const rule of rules) {
    if (rule.match_text && n.includes(normalize(rule.match_text))) {
      return rule.category_id
    }
  }
  return null
}

// '' and whitespace-only strings must not be sent to Postgres uuid columns.
function blankToNull(v: string | null | undefined): string | null {
  if (!v || !v.trim()) return null
  return v
}

export async function saveExpense(
  input: SaveExpenseInput
): Promise<{ id: string } | { error: string }> {
  let supabase
  try {
    supabase = getServerClient()
  } catch {
    return { error: 'Database is not configured. Add Supabase environment variables to .env.local.' }
  }

  // ── Insert expense ───────────────────────────────────────────────────────
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
    })
    .select('id')
    .single()

  if (expenseError || !expense) {
    return { error: expenseError?.message ?? 'Failed to save expense.' }
  }

  if (input.items.length === 0) return { id: expense.id }

  // ── Fetch categories + rules for server-side emergency matching ──────────
  // Even if the client already resolved categories, we re-fetch here so the
  // server can independently assign categories regardless of client state.
  const [catRes, rulesRes] = await Promise.all([
    supabase.from('categories').select('id, slug, name'),
    supabase.from('category_rules').select('category_id, match_text, priority'),
  ])

  if (catRes.error) {
    console.error('[saveExpense] categories fetch error:', catRes.error.message)
  }
  if (rulesRes.error) {
    console.error('[saveExpense] rules fetch error:', rulesRes.error.message)
  }

  const serverCategories = catRes.data ?? []
  const serverRules = rulesRes.data ?? []
  const otherCategoryId = serverCategories.find((c) => c.slug === 'other')?.id ?? null

  if (process.env.NODE_ENV === 'development') {
    console.log('[saveExpense] server context:', {
      categoriesLoaded: serverCategories.length,
      rulesLoaded: serverRules.length,
      otherCategoryId,
    })
  }

  // ── Build item rows ──────────────────────────────────────────────────────
  const rows = input.items
    .filter((item) => item.description.trim())
    .map((item) => {
      // Derive amount from unit_price × quantity when client didn't compute it.
      const amount =
        item.amount ??
        (item.unit_price != null ? (item.quantity ?? 1) * item.unit_price : null)

      // Category resolution chain:
      // 1. Client-provided category_id (must be non-blank)
      // 2. Server-side match by description
      // 3. Other category
      // 4. null (only if Other doesn't exist in DB)
      const clientCat = blankToNull(item.category_id)
      const matchedCat = clientCat ?? serverMatch(item.description, serverRules)
      const finalCategoryId = matchedCat ?? otherCategoryId

      if (process.env.NODE_ENV === 'development') {
        console.log('[saveExpense] item:', {
          description: item.description.slice(0, 50),
          clientCat,
          matchedCat,
          finalCategoryId,
          amount,
        })
      }

      if (finalCategoryId === null) {
        console.warn(
          '[saveExpense] could not resolve category for item (Other missing from DB?):',
          item.description.slice(0, 50)
        )
      }

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
    // Don't fail the whole save — the expense header was already committed.
  }

  return { id: expense.id }
}
