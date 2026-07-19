'use server'

import { getServerClient } from '@/app/lib/supabase/server'

export type RecategorizeScope =
  | { type: 'item'; itemId: string; description: string | null }
  | { type: 'description'; description: string }
  | { type: 'expense'; expenseId: string }

// User corrections outrank every keyword rule (pets 'cat' is 600).
const LEARNED_RULE_PRIORITY = 700

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, '\\$&')
}

/**
 * Change a category from the UI.
 *
 * Item/description scopes also propagate to every saved item with the same
 * product description and store a "learned rule" (the exact description at
 * high priority) so future scans of this product classify the same way.
 */
export async function recategorize(input: {
  scope: RecategorizeScope
  categoryId: string | null
}): Promise<{ ok: true; learned: boolean } | { error: string }> {
  let supabase
  try {
    supabase = await getServerClient()
  } catch {
    return { error: 'Database is not configured. Add Supabase environment variables to .env.local.' }
  }

  const { scope, categoryId } = input

  if (scope.type === 'expense') {
    const { error } = await supabase
      .from('expenses')
      .update({ category_id: categoryId })
      .eq('id', scope.expenseId)
    if (error) return { error: error.message }
    return { ok: true, learned: false }
  }

  if (scope.type === 'item') {
    const { error } = await supabase
      .from('expense_items')
      .update({ category_id: categoryId })
      .eq('id', scope.itemId)
    if (error) return { error: error.message }
  }

  const description = scope.description?.trim()
  let learned = false

  if (description) {
    // Propagate to all items of the same product, past and present.
    const { error: bulkError } = await supabase
      .from('expense_items')
      .update({ category_id: categoryId })
      .ilike('description', escapeLike(description))
    if (bulkError && scope.type === 'description') return { error: bulkError.message }

    // Learn the correction: replace any previous rule keyed to this exact
    // description. Curated rules are short keywords, so a full product
    // description can only ever collide with an earlier learned rule.
    if (categoryId) {
      const { error: deleteError } = await supabase
        .from('category_rules')
        .delete()
        .eq('match_text', description)
      const { error: insertError } = deleteError
        ? { error: deleteError }
        : await supabase.from('category_rules').insert({
            category_id: categoryId,
            match_text: description,
            language: 'any',
            priority: LEARNED_RULE_PRIORITY,
          })
      if (insertError) {
        console.error(
          '[recategorize] could not save learned rule (run supabase/rls_learned_rules.sql):',
          insertError.message
        )
      } else {
        learned = true
      }
    }
  }

  return { ok: true, learned }
}
