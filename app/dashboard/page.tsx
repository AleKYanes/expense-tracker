export const dynamic = 'force-dynamic'

import Link from 'next/link'

type Expense = {
  id: string
  vendor_name: string
  invoice_date: string | null
  total_amount: number
  currency: string
  created_at: string
  category_id: string | null
}

type ExpenseItem = {
  expense_id: string
  amount: number | null
  category_id: string | null
}

type Category = {
  id: string
  name: string
  color: string | null
  slug: string
}

type CategoryStat = {
  name: string
  color: string | null
  total: number
  count: number
}

type VendorStat = {
  name: string
  total: number
  count: number
}

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

export default async function Dashboard() {
  let monthExpenses: Expense[] = []
  let recentExpenses: Expense[] = []
  let allCategories: Category[] = []
  let monthItems: ExpenseItem[] = []
  let dbError: string | null = null

  try {
    const { getServerClient } = await import('@/app/lib/supabase/server')
    const supabase = getServerClient()

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0]

    const [catRes, monthRes, recentRes] = await Promise.all([
      supabase.from('categories').select('id, name, color, slug'),
      supabase
        .from('expenses')
        .select('id, vendor_name, invoice_date, total_amount, currency, created_at, category_id')
        .gte('invoice_date', monthStart)
        .order('invoice_date', { ascending: false }),
      supabase
        .from('expenses')
        .select('id, vendor_name, invoice_date, total_amount, currency, created_at, category_id')
        .order('created_at', { ascending: false })
        .limit(15),
    ])

    if (catRes.error) throw catRes.error
    if (monthRes.error) throw monthRes.error
    if (recentRes.error) throw recentRes.error

    allCategories = (catRes.data ?? []) as Category[]
    monthExpenses = (monthRes.data ?? []) as Expense[]
    recentExpenses = (recentRes.data ?? []) as Expense[]

    // Fetch line items for this month's expenses
    const monthExpenseIds = monthExpenses.map((e) => e.id)
    if (monthExpenseIds.length > 0) {
      const itemsRes = await supabase
        .from('expense_items')
        .select('expense_id, amount, category_id')
        .in('expense_id', monthExpenseIds)
      if (!itemsRes.error) {
        monthItems = (itemsRes.data ?? []) as ExpenseItem[]
      }
    }
  } catch (err) {
    dbError =
      err instanceof Error && err.message.includes('not configured')
        ? 'Add Supabase credentials to .env.local to see your dashboard.'
        : 'Could not load expenses. Check your Supabase setup.'
  }

  // Build a lookup of category by id
  const catById = new Map(allCategories.map((c) => [c.id, c]))
  const otherCategory = allCategories.find((c) => c.slug === 'other')

  // ── Category totals ──────────────────────────────────────────────────────
  // Group items by expense id
  const itemsByExpense = new Map<string, ExpenseItem[]>()
  for (const item of monthItems) {
    const list = itemsByExpense.get(item.expense_id) ?? []
    list.push(item)
    itemsByExpense.set(item.expense_id, list)
  }

  // Resolve a category id: use it if known, fall back to Other, then null (Uncategorized)
  function resolveCategory(catId: string | null): string | null {
    if (catId && catById.has(catId)) return catId
    return otherCategory?.id ?? null
  }

  const catTotals = new Map<string, CategoryStat>()

  function addToCategory(catId: string | null, amount: number) {
    const cat = catId ? catById.get(catId) : null
    const key = catId ?? '__none__'
    const existing = catTotals.get(key)
    if (existing) {
      existing.total += amount
      existing.count++
    } else {
      catTotals.set(key, {
        name: cat?.name ?? 'Uncategorized',
        color: cat?.color ?? null,
        total: amount,
        count: 1,
      })
    }
  }

  for (const expense of monthExpenses) {
    const items = itemsByExpense.get(expense.id) ?? []

    if (items.length === 0) {
      // No line items — use expense-level category (with Other fallback)
      addToCategory(resolveCategory(expense.category_id), expense.total_amount ?? 0)
      continue
    }

    const itemsWithAmount = items.filter((i) => i.amount != null && i.amount > 0)

    if (itemsWithAmount.length > 0) {
      // Items have explicit amounts — sum by item category
      for (const item of itemsWithAmount) {
        addToCategory(resolveCategory(item.category_id), item.amount!)
      }
    } else {
      // Items exist but amounts are all null (Textract often omits per-item amounts).
      // Distribute expense.total_amount equally across items, using each item's category.
      const share = (expense.total_amount ?? 0) / items.length
      for (const item of items) {
        // Per-item category → expense category → Other → Uncategorized
        const catId =
          (item.category_id && catById.has(item.category_id) ? item.category_id : null) ??
          resolveCategory(expense.category_id)
        addToCategory(catId, share)
      }
    }
  }

  const categoryStats = [...catTotals.values()].sort((a, b) => b.total - a.total)

  // ── Vendor totals ────────────────────────────────────────────────────────
  const vendorMap = new Map<string, VendorStat>()
  for (const expense of monthExpenses) {
    const name = expense.vendor_name || 'Unknown'
    const existing = vendorMap.get(name)
    if (existing) {
      existing.total += expense.total_amount ?? 0
      existing.count++
    } else {
      vendorMap.set(name, { name, total: expense.total_amount ?? 0, count: 1 })
    }
  }
  const topVendors = [...vendorMap.values()].sort((a, b) => b.total - a.total).slice(0, 5)

  const monthTotal = monthExpenses.reduce((s, e) => s + (e.total_amount ?? 0), 0)
  const monthCount = monthExpenses.length
  const primaryCurrency = monthExpenses[0]?.currency ?? 'CZK'

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">{monthLabel}</p>
          </div>
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

        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs text-gray-400 mb-1">Spent this month</p>
            <p className="text-2xl font-bold text-gray-900">
              {monthCount === 0 ? '—' : fmt(monthTotal, primaryCurrency)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs text-gray-400 mb-1">Invoices this month</p>
            <p className="text-2xl font-bold text-gray-900">{monthCount}</p>
          </div>
        </div>

        {/* Category breakdown */}
        {categoryStats.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">By category</h2>
            <p className="text-xs text-gray-400 mb-4">
              Based on line item categories where available
            </p>
            <div className="space-y-3">
              {categoryStats.map((cat, i) => {
                const pct = monthTotal > 0 ? (cat.total / monthTotal) * 100 : 0
                return (
                  <div key={i}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm text-gray-700">{cat.name}</span>
                      <span className="text-sm font-medium text-gray-900">
                        {fmt(cat.total, primaryCurrency)}
                        <span className="ml-1.5 text-xs font-normal text-gray-400">
                          {pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct.toFixed(1)}%`,
                          backgroundColor: cat.color ?? '#94a3b8',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Top vendors */}
        {topVendors.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Top vendors</h2>
            <div className="divide-y divide-gray-50">
              {topVendors.map((v) => (
                <div key={v.name} className="flex justify-between items-center py-2.5">
                  <div>
                    <p className="text-sm text-gray-800">{v.name}</p>
                    <p className="text-xs text-gray-400">
                      {v.count} invoice{v.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {fmt(v.total, primaryCurrency)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent expenses */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent expenses</h2>
            <Link href="/expenses" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>

          {recentExpenses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 mb-3">No expenses yet.</p>
              <Link
                href="/"
                className="text-sm text-white bg-blue-600 px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Upload your first invoice
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentExpenses.map((expense) => {
                const cat = expense.category_id ? catById.get(expense.category_id) : null
                return (
                  <Link
                    key={expense.id}
                    href={`/expenses/${expense.id}`}
                    className="flex justify-between items-start py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {expense.vendor_name || 'Unknown vendor'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-400">{fmtDate(expense.invoice_date)}</p>
                        {cat && (
                          <span className="text-xs text-gray-400">· {cat.name}</span>
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
      </div>
    </div>
  )
}
