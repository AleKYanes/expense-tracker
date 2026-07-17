export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { normalize } from '@/app/lib/categoryMatcher'
import { monthKey, parseMonthParam } from '@/app/lib/month'
import { toISODate } from '@/app/lib/budget'

type Expense = {
  id: string
  vendor_name: string
  invoice_date: string | null
  total_amount: number
  currency: string
  category_id: string | null
}

type ExpenseItem = {
  expense_id: string
  description: string | null
  quantity: number | null
  amount: number | null
  category_id: string | null
}

type Category = {
  id: string
  name: string
  color: string | null
  slug: string
}

type ProductStat = {
  name: string
  total: number
  qty: number
  qtyKnown: boolean
  times: number
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

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ month?: string; sort?: string }>
}) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const { month: monthParam, sort: sortParam } = await searchParams
  const sortBy: 'spent' | 'count' = sortParam === 'count' ? 'count' : 'spent'

  const now = new Date()
  const viewed = parseMonthParam(monthParam, now)
  const viewedKey = monthKey(viewed)
  const isCurrentMonth = viewedKey === monthKey(now)
  const prevKey = monthKey(new Date(viewed.getFullYear(), viewed.getMonth() - 1, 1))
  const nextKey = monthKey(new Date(viewed.getFullYear(), viewed.getMonth() + 1, 1))
  const monthStart = toISODate(viewed)
  const monthEnd = toISODate(new Date(viewed.getFullYear(), viewed.getMonth() + 1, 1))

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(viewed)

  let allCategories: Category[] = []
  let monthExpenses: Expense[] = []
  let monthItems: ExpenseItem[] = []
  let dbError: string | null = null

  try {
    const { getServerClient } = await import('@/app/lib/supabase/server')
    const supabase = await getServerClient()

    const [catRes, monthRes] = await Promise.all([
      supabase.from('categories').select('id, name, color, slug'),
      supabase
        .from('expenses')
        .select('id, vendor_name, invoice_date, total_amount, currency, category_id')
        .gte('invoice_date', monthStart)
        .lt('invoice_date', monthEnd)
        .order('invoice_date', { ascending: false }),
    ])

    if (catRes.error) throw catRes.error
    if (monthRes.error) throw monthRes.error

    allCategories = (catRes.data ?? []) as Category[]
    monthExpenses = (monthRes.data ?? []) as Expense[]

    const ids = monthExpenses.map((e) => e.id)
    if (ids.length > 0) {
      const itemsRes = await supabase
        .from('expense_items')
        .select('expense_id, description, quantity, amount, category_id')
        .in('expense_id', ids)
      if (!itemsRes.error) monthItems = (itemsRes.data ?? []) as ExpenseItem[]
    }
  } catch (err) {
    dbError =
      err instanceof Error && err.message.includes('not configured')
        ? 'Add Supabase credentials to .env.local.'
        : 'Could not load expenses. Check your Supabase setup.'
  }

  const category = allCategories.find((c) => c.slug === slug) ?? null
  const catById = new Map(allCategories.map((c) => [c.id, c]))
  const otherCategory = allCategories.find((c) => c.slug === 'other')

  if (!category && !dbError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-8">
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
            Category &quot;{slug}&quot; not found.
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Restrict aggregates to one currency, same as the dashboard.
  const currencies = new Set(monthExpenses.map((e) => e.currency || 'CZK'))
  const primaryCurrency = currencies.has('CZK') ? 'CZK' : [...currencies][0] ?? 'CZK'
  const primaryExpenses = monthExpenses.filter(
    (e) => (e.currency || 'CZK') === primaryCurrency
  )

  const itemsByExpense = new Map<string, ExpenseItem[]>()
  for (const item of monthItems) {
    const list = itemsByExpense.get(item.expense_id) ?? []
    list.push(item)
    itemsByExpense.set(item.expense_id, list)
  }

  function resolveCategory(catId: string | null): string | null {
    if (catId && catById.has(catId)) return catId
    return otherCategory?.id ?? null
  }

  // Mirror the dashboard's attribution so this page's total matches the
  // number the user clicked on.
  const products = new Map<string, ProductStat>()
  const contributingExpenses = new Map<string, Expense>()

  function contribute(
    catId: string | null,
    name: string,
    qty: number | null,
    amount: number,
    expense: Expense
  ) {
    if (!category || catId !== category.id) return
    contributingExpenses.set(expense.id, expense)
    const key = normalize(name)
    const existing = products.get(key)
    if (existing) {
      existing.total += amount
      existing.times++
      if (qty != null) {
        existing.qty += qty
        existing.qtyKnown = true
      }
    } else {
      products.set(key, {
        name,
        total: amount,
        qty: qty ?? 0,
        qtyKnown: qty != null,
        times: 1,
      })
    }
  }

  for (const expense of primaryExpenses) {
    const items = itemsByExpense.get(expense.id) ?? []

    if (items.length === 0) {
      contribute(
        resolveCategory(expense.category_id),
        expense.vendor_name || 'Unknown vendor',
        null,
        expense.total_amount ?? 0,
        expense
      )
      continue
    }

    const itemsWithAmount = items.filter((i) => i.amount != null && i.amount > 0)

    if (itemsWithAmount.length > 0) {
      for (const item of itemsWithAmount) {
        contribute(
          resolveCategory(item.category_id),
          item.description || '(no description)',
          item.quantity,
          item.amount!,
          expense
        )
      }
    } else {
      const share = (expense.total_amount ?? 0) / items.length
      for (const item of items) {
        const catId =
          (item.category_id && catById.has(item.category_id) ? item.category_id : null) ??
          resolveCategory(expense.category_id)
        contribute(catId, item.description || '(no description)', item.quantity, share, expense)
      }
    }
  }

  const productList = [...products.values()].sort((a, b) =>
    sortBy === 'count' ? b.times - a.times || b.total - a.total : b.total - a.total
  )
  const categoryTotal = productList.reduce((s, p) => s + p.total, 0)
  const expenseList = [...contributingExpenses.values()].sort((a, b) =>
    (b.invoice_date ?? '').localeCompare(a.invoice_date ?? '')
  )

  const sortLink = (sort: 'spent' | 'count') =>
    `/categories/${encodeURIComponent(slug)}?month=${viewedKey}&sort=${sort}`
  const monthLink = (key: string) =>
    `/categories/${encodeURIComponent(slug)}?month=${key}&sort=${sortBy}`

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link
          href={`/dashboard?month=${viewedKey}`}
          className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          ← Dashboard
        </Link>

        <div className="flex items-center justify-between mt-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2.5">
              <span
                className="inline-block w-3.5 h-3.5 rounded-full shrink-0"
                style={{ backgroundColor: category?.color ?? '#94a3b8' }}
              />
              {category?.name ?? slug}
            </h1>
            <div className="flex items-center gap-1 mt-0.5">
              <Link
                href={monthLink(prevKey)}
                aria-label="Previous month"
                className="px-1.5 py-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                ‹
              </Link>
              <p className="text-sm text-gray-400 dark:text-gray-500 min-w-28 text-center">
                {monthLabel}
              </p>
              {isCurrentMonth ? (
                <span className="px-1.5 py-0.5 text-gray-200 dark:text-gray-700 select-none">›</span>
              ) : (
                <Link
                  href={monthLink(nextKey)}
                  aria-label="Next month"
                  className="px-1.5 py-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  ›
                </Link>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Total</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {productList.length === 0 ? '—' : fmt(categoryTotal, primaryCurrency)}
            </p>
          </div>
        </div>

        {dbError && (
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm rounded-xl px-4 py-3 mb-6">
            {dbError}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Products</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {productList.length === 0
                  ? 'Nothing in this category this month'
                  : `${productList.length} product${productList.length !== 1 ? 's' : ''} · ${monthLabel}`}
              </p>
            </div>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
              <Link
                href={sortLink('spent')}
                className={`px-3 py-1.5 transition-colors ${
                  sortBy === 'spent'
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                Spent
              </Link>
              <Link
                href={sortLink('count')}
                className={`px-3 py-1.5 border-l border-gray-200 dark:border-gray-700 transition-colors ${
                  sortBy === 'count'
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                Frequency
              </Link>
            </div>
          </div>

          {productList.length === 0 ? (
            <p className="text-sm text-gray-300 dark:text-gray-600 text-center py-6">
              No expenses in {category?.name ?? slug} in {monthLabel}.
            </p>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {productList.map((p) => {
                const pct = categoryTotal > 0 ? (p.total / categoryTotal) * 100 : 0
                return (
                  <div key={p.name} className="py-3">
                    <div className="flex justify-between items-baseline gap-3 mb-1">
                      <p className="text-sm text-gray-800 dark:text-gray-200 min-w-0 truncate">
                        {p.name}
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 shrink-0">
                        {fmt(p.total, primaryCurrency)}
                        <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
                          {pct.toFixed(0)}%
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct.toFixed(1)}%`,
                            backgroundColor: category?.color ?? '#94a3b8',
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                        ×{p.times}
                        {p.qtyKnown && ` · qty ${fmtQty(p.qty)}`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {expenseList.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              From {expenseList.length} expense{expenseList.length !== 1 ? 's' : ''}
            </h2>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {expenseList.map((expense) => (
                <Link
                  key={expense.id}
                  href={`/expenses/${expense.id}`}
                  className="flex justify-between items-center py-3 hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {expense.vendor_name || 'Unknown vendor'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {fmtDate(expense.invoice_date)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">
                    {fmt(expense.total_amount, expense.currency)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
