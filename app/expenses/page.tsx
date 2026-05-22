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

type Category = { id: string; name: string; color: string | null }
type ItemCount = { expense_id: string }

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

export default async function ExpensesPage() {
  let expenses: ExpenseRow[] = []
  let categories: Category[] = []
  let itemCounts: ItemCount[] = []
  let dbError: string | null = null

  try {
    const { getServerClient } = await import('@/app/lib/supabase/server')
    const supabase = getServerClient()

    const [expRes, catRes] = await Promise.all([
      supabase
        .from('expenses')
        .select(
          'id, vendor_name, invoice_date, invoice_number, total_amount, currency, created_at, category_id'
        )
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('categories').select('id, name, color'),
    ])

    if (expRes.error) throw expRes.error
    if (catRes.error) throw catRes.error

    expenses = (expRes.data ?? []) as ExpenseRow[]
    categories = (catRes.data ?? []) as Category[]

    // Count line items per expense
    const expIds = expenses.map((e) => e.id)
    if (expIds.length > 0) {
      const countRes = await supabase
        .from('expense_items')
        .select('expense_id')
        .in('expense_id', expIds)
      itemCounts = (countRes.data ?? []) as ItemCount[]
    }
  } catch (err) {
    dbError =
      err instanceof Error && err.message.includes('not configured')
        ? 'Add Supabase credentials to .env.local.'
        : 'Could not load expenses.'
  }

  const catById = new Map(categories.map((c) => [c.id, c]))
  const itemCountByExpense = new Map<string, number>()
  for (const row of itemCounts) {
    itemCountByExpense.set(
      row.expense_id,
      (itemCountByExpense.get(row.expense_id) ?? 0) + 1
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <Link
            href="/"
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
          >
            + New invoice
          </Link>
        </div>

        {dbError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3 mb-6">
            {dbError}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          {expenses.length === 0 ? (
            <div className="text-center py-16 px-6">
              <p className="text-sm text-gray-400 mb-4">
                No expenses yet. Upload your first invoice to start tracking.
              </p>
              <Link
                href="/"
                className="inline-block bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Upload invoice
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expenses.map((expense) => {
                const cat = expense.category_id ? catById.get(expense.category_id) : null
                const itemCount = itemCountByExpense.get(expense.id) ?? 0
                return (
                  <Link
                    key={expense.id}
                    href={`/expenses/${expense.id}`}
                    className="flex justify-between items-start px-5 py-4 hover:bg-gray-50 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {expense.vendor_name || 'Unknown vendor'}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-gray-400">
                          {fmtDate(expense.invoice_date)}
                        </span>
                        {cat && (
                          <span className="text-xs text-gray-400">· {cat.name}</span>
                        )}
                        {itemCount > 0 && (
                          <span className="text-xs text-gray-300">
                            · {itemCount} item{itemCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 shrink-0">
                      {fmt(expense.total_amount, expense.currency)}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {expenses.length > 0 && (
          <p className="text-xs text-gray-400 text-center mt-4">
            Showing {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
