export const dynamic = 'force-dynamic'

import Link from 'next/link'

type ExpenseRow = {
  id: string
  vendor_name: string
  invoice_date: string | null
  invoice_number: string | null
  total_amount: number
  currency: string
  created_at: string
  category_id: string | null
}

type Category = { id: string; name: string; color: string | null; slug: string }
type ItemRow = { expense_id: string; category_id: string | null }

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: currency || 'CZK',
    minimumFractionDigits: 2,
  }).format(amount)
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category: categoryParam } = await searchParams

  let expenses: ExpenseRow[] = []
  let categories: Category[] = []
  let itemRows: ItemRow[] = []
  let dbError: string | null = null

  try {
    const { getServerClient } = await import('@/app/lib/supabase/server')
    const supabase = await getServerClient()

    const [expRes, catRes] = await Promise.all([
      supabase
        .from('expenses')
        .select(
          'id, vendor_name, invoice_date, invoice_number, total_amount, currency, created_at, category_id'
        )
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('categories').select('id, name, color, slug'),
    ])

    if (expRes.error) throw expRes.error
    if (catRes.error) throw catRes.error

    expenses = (expRes.data ?? []) as ExpenseRow[]
    categories = (catRes.data ?? []) as Category[]

    const expIds = expenses.map((e) => e.id)
    if (expIds.length > 0) {
      const itemsRes = await supabase
        .from('expense_items')
        .select('expense_id, category_id')
        .in('expense_id', expIds)
      itemRows = (itemsRes.data ?? []) as ItemRow[]
    }
  } catch (err) {
    dbError =
      err instanceof Error && err.message.includes('not configured')
        ? 'Add Supabase credentials to .env.local.'
        : 'Could not load expenses.'
  }

  const catById = new Map(categories.map((c) => [c.id, c]))
  const itemCountByExpense = new Map<string, number>()
  const itemCatsByExpense = new Map<string, Set<string>>()
  for (const row of itemRows) {
    itemCountByExpense.set(
      row.expense_id,
      (itemCountByExpense.get(row.expense_id) ?? 0) + 1
    )
    if (row.category_id) {
      const set = itemCatsByExpense.get(row.expense_id) ?? new Set<string>()
      set.add(row.category_id)
      itemCatsByExpense.set(row.expense_id, set)
    }
  }

  // Category filter (?category=<slug>): matches the expense's own category or
  // any of its line items' categories — same attribution the dashboard uses.
  const activeCategory = categoryParam
    ? categories.find((c) => c.slug === categoryParam) ?? null
    : null
  const visibleExpenses = activeCategory
    ? expenses.filter(
        (e) =>
          e.category_id === activeCategory.id ||
          itemCatsByExpense.get(e.id)?.has(activeCategory.id)
      )
    : expenses

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Expenses</h1>
          <Link
            href="/"
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
          >
            + New invoice
          </Link>
        </div>

        {dbError && (
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm rounded-xl px-4 py-3 mb-6">
            {dbError}
          </div>
        )}

        {activeCategory && (
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full pl-3 pr-1.5 py-1 text-xs text-gray-600 dark:text-gray-300">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: activeCategory.color ?? '#94a3b8' }}
              />
              {activeCategory.name}
              <Link
                href="/expenses"
                aria-label="Clear category filter"
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                ×
              </Link>
            </span>
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
          {visibleExpenses.length === 0 ? (
            <div className="text-center py-16 px-6">
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                {activeCategory
                  ? `No expenses in ${activeCategory.name} among your latest ${expenses.length} expenses.`
                  : 'No expenses yet. Upload your first invoice to start tracking.'}
              </p>
              {activeCategory ? (
                <Link
                  href="/expenses"
                  className="inline-block bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Show all expenses
                </Link>
              ) : (
                <Link
                  href="/"
                  className="inline-block bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Upload invoice
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {visibleExpenses.map((expense) => {
                const cat = expense.category_id ? catById.get(expense.category_id) : null
                const itemCount = itemCountByExpense.get(expense.id) ?? 0
                return (
                  <Link
                    key={expense.id}
                    href={`/expenses/${expense.id}`}
                    className="flex justify-between items-start px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {expense.vendor_name || 'Unknown vendor'}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {fmtDate(expense.invoice_date)}
                        </span>
                        {cat && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">· {cat.name}</span>
                        )}
                        {itemCount > 0 && (
                          <span className="text-xs text-gray-300 dark:text-gray-600">
                            · {itemCount} item{itemCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">
                      {fmt(expense.total_amount, expense.currency)}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {visibleExpenses.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-600 text-center mt-4">
            Showing {visibleExpenses.length} expense{visibleExpenses.length !== 1 ? 's' : ''}
            {activeCategory ? ` in ${activeCategory.name}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}
