export const dynamic = 'force-dynamic'

import Link from 'next/link'
import {
  MONTHLY_BUDGET,
  BUDGET_CURRENCY,
  payPeriodFor,
  toISODate,
} from '@/app/lib/budget'

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
  slug: string | null
  color: string | null
  total: number
  count: number
}

type VendorStat = {
  name: string
  total: number
  count: number
}

type TrendRow = {
  invoice_date: string | null
  total_amount: number
  currency: string
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: currency || 'CZK',
    minimumFractionDigits: 2,
  }).format(amount)
}

function fmtCompact(amount: number) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
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

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function MaybeLink({
  href,
  className,
  children,
}: {
  href: string | null
  className: string
  children: React.ReactNode
}) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  )
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: monthParam } = await searchParams

  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  let viewed = currentMonthStart
  if (monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number)
    const candidate = new Date(y, m - 1, 1)
    // Don't navigate into the future.
    if (candidate.getTime() <= currentMonthStart.getTime()) viewed = candidate
  }
  const viewedKey = monthKey(viewed)
  const isCurrentMonth = viewedKey === monthKey(now)
  const prevKey = monthKey(new Date(viewed.getFullYear(), viewed.getMonth() - 1, 1))
  const nextKey = monthKey(new Date(viewed.getFullYear(), viewed.getMonth() + 1, 1))

  const monthStart = toISODate(viewed)
  const monthEnd = toISODate(new Date(viewed.getFullYear(), viewed.getMonth() + 1, 1))
  const trendStart = toISODate(new Date(viewed.getFullYear(), viewed.getMonth() - 5, 1))

  const period = payPeriodFor(now)

  let monthExpenses: Expense[] = []
  let recentExpenses: Expense[] = []
  let allCategories: Category[] = []
  let monthItems: ExpenseItem[] = []
  let trendRows: TrendRow[] = []
  let budgetRows: { total_amount: number; currency: string }[] = []
  let dbError: string | null = null

  try {
    const { getServerClient } = await import('@/app/lib/supabase/server')
    const supabase = await getServerClient()

    const [catRes, monthRes, recentRes, trendRes] = await Promise.all([
      supabase.from('categories').select('id, name, color, slug'),
      supabase
        .from('expenses')
        .select('id, vendor_name, invoice_date, total_amount, currency, created_at, category_id')
        .gte('invoice_date', monthStart)
        .lt('invoice_date', monthEnd)
        .order('invoice_date', { ascending: false }),
      supabase
        .from('expenses')
        .select('id, vendor_name, invoice_date, total_amount, currency, created_at, category_id')
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('expenses')
        .select('invoice_date, total_amount, currency')
        .gte('invoice_date', trendStart)
        .lt('invoice_date', monthEnd),
    ])

    if (catRes.error) throw catRes.error
    if (monthRes.error) throw monthRes.error
    if (recentRes.error) throw recentRes.error
    if (trendRes.error) throw trendRes.error

    allCategories = (catRes.data ?? []) as Category[]
    monthExpenses = (monthRes.data ?? []) as Expense[]
    recentExpenses = (recentRes.data ?? []) as Expense[]
    trendRows = (trendRes.data ?? []) as TrendRow[]

    if (isCurrentMonth) {
      const budgetRes = await supabase
        .from('expenses')
        .select('total_amount, currency')
        .gte('invoice_date', toISODate(period.start))
        .lt('invoice_date', toISODate(period.end))
      if (!budgetRes.error) {
        budgetRows = (budgetRes.data ?? []) as { total_amount: number; currency: string }[]
      }
    }

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

  const catById = new Map(allCategories.map((c) => [c.id, c]))
  const otherCategory = allCategories.find((c) => c.slug === 'other')

  // ── Currency handling ──────────────────────────────────────────────────────
  // Sums across currencies are meaningless, so all aggregates use one primary
  // currency (CZK when present) and expenses in other currencies are surfaced
  // separately instead of being silently mixed in.
  const totalsByCurrency = new Map<string, number>()
  for (const e of monthExpenses) {
    const cur = e.currency || 'CZK'
    totalsByCurrency.set(cur, (totalsByCurrency.get(cur) ?? 0) + (e.total_amount ?? 0))
  }
  const primaryCurrency = totalsByCurrency.has('CZK')
    ? 'CZK'
    : [...totalsByCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'CZK'
  const otherCurrencyTotals = [...totalsByCurrency.entries()].filter(
    ([c]) => c !== primaryCurrency
  )
  const primaryMonthExpenses = monthExpenses.filter(
    (e) => (e.currency || 'CZK') === primaryCurrency
  )
  const excludedCount = monthExpenses.length - primaryMonthExpenses.length

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
        slug: cat?.slug ?? null,
        color: cat?.color ?? null,
        total: amount,
        count: 1,
      })
    }
  }

  for (const expense of primaryMonthExpenses) {
    const items = itemsByExpense.get(expense.id) ?? []

    if (items.length === 0) {
      addToCategory(resolveCategory(expense.category_id), expense.total_amount ?? 0)
      continue
    }

    const itemsWithAmount = items.filter((i) => i.amount != null && i.amount > 0)

    if (itemsWithAmount.length > 0) {
      for (const item of itemsWithAmount) {
        addToCategory(resolveCategory(item.category_id), item.amount!)
      }
    } else {
      const share = (expense.total_amount ?? 0) / items.length
      for (const item of items) {
        const catId =
          (item.category_id && catById.has(item.category_id) ? item.category_id : null) ??
          resolveCategory(expense.category_id)
        addToCategory(catId, share)
      }
    }
  }

  const categoryStats = [...catTotals.values()].sort((a, b) => b.total - a.total)

  const vendorMap = new Map<string, VendorStat>()
  for (const expense of primaryMonthExpenses) {
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

  const monthTotal = totalsByCurrency.get(primaryCurrency) ?? 0
  const monthCount = monthExpenses.length
  const topCategory = categoryStats[0] ?? null
  const topCategoryPct =
    topCategory && monthTotal > 0 ? (topCategory.total / monthTotal) * 100 : 0

  // ── Monthly trend (6 months ending at the viewed month) ────────────────────
  const trendTotals = new Map<string, number>()
  for (const row of trendRows) {
    if ((row.currency || 'CZK') !== primaryCurrency) continue
    const key = (row.invoice_date ?? '').slice(0, 7)
    if (!key) continue
    trendTotals.set(key, (trendTotals.get(key) ?? 0) + (row.total_amount ?? 0))
  }
  const trendMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(viewed.getFullYear(), viewed.getMonth() - 5 + i, 1)
    const key = monthKey(d)
    return {
      key,
      short: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d),
      label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d),
      total: trendTotals.get(key) ?? 0,
    }
  })
  const trendMax = Math.max(...trendMonths.map((m) => m.total))
  const trendMaxKey = trendMonths.reduce((a, b) => (b.total > a.total ? b : a)).key
  const trendHasData = trendMax > 0

  // ── Pay-period budget ──────────────────────────────────────────────────────
  const budgetSpent = budgetRows
    .filter((r) => (r.currency || 'CZK') === BUDGET_CURRENCY)
    .reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const budgetPct = (budgetSpent / MONTHLY_BUDGET) * 100
  const budgetRemaining = MONTHLY_BUDGET - budgetSpent
  const budgetOver = budgetRemaining < 0
  const budgetWarn = !budgetOver && budgetPct >= 80
  const msPerDay = 86_400_000
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysLeft = Math.max(
    0,
    Math.round((period.end.getTime() - todayMidnight.getTime()) / msPerDay)
  )

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(viewed)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <Link
                href={`/dashboard?month=${prevKey}`}
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
                  href={`/dashboard?month=${nextKey}`}
                  aria-label="Next month"
                  className="px-1.5 py-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  ›
                </Link>
              )}
              {!isCurrentMonth && (
                <Link
                  href="/dashboard"
                  className="ml-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Today
                </Link>
              )}
            </div>
          </div>
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

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Spent</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {monthCount === 0 ? '—' : fmt(monthTotal, primaryCurrency)}
            </p>
            {otherCurrencyTotals.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                + {otherCurrencyTotals.map(([c, t]) => fmt(t, c)).join(' + ')}
              </p>
            )}
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Invoices</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{monthCount}</p>
          </div>
          {topCategory && monthTotal > 0 && (
            <MaybeLink
              href={
                topCategory.slug
                  ? `/categories/${encodeURIComponent(topCategory.slug)}?month=${viewedKey}`
                  : null
              }
              className="col-span-2 block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Top category</p>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: topCategory.color ?? '#94a3b8' }}
                  />
                  <span className="truncate">{topCategory.name}</span>
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 shrink-0">
                  {fmt(topCategory.total, primaryCurrency)}
                  <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
                    {topCategoryPct.toFixed(0)}% of spending
                  </span>
                </p>
              </div>
            </MaybeLink>
          )}
        </div>

        {isCurrentMonth && !dbError && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 mb-4">
            <div className="flex justify-between items-baseline mb-1">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Pay-period budget
              </h2>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {fmtDate(toISODate(period.start))} – {fmtDate(toISODate(period.end))}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {fmt(budgetSpent, BUDGET_CURRENCY)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                of {fmt(MONTHLY_BUDGET, BUDGET_CURRENCY)}
              </p>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full ${
                  budgetOver ? 'bg-red-500' : budgetWarn ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(budgetPct, 100).toFixed(1)}%` }}
              />
            </div>
            <div className="flex justify-between items-center">
              <p
                className={`text-xs font-medium ${
                  budgetOver
                    ? 'text-red-600 dark:text-red-400'
                    : budgetWarn
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {budgetOver
                  ? `⚠ ${fmt(-budgetRemaining, BUDGET_CURRENCY)} over budget`
                  : `${fmt(budgetRemaining, BUDGET_CURRENCY)} left (${budgetPct.toFixed(0)}% used)`}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {daysLeft} day{daysLeft !== 1 ? 's' : ''} until payday
              </p>
            </div>
          </div>
        )}

        {trendHasData && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Monthly trend
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Last 6 months · {primaryCurrency}
            </p>
            <div className="flex items-end gap-2">
              {trendMonths.map((m) => {
                const barHeight =
                  m.total > 0 ? Math.max(4, Math.round((m.total / trendMax) * 96)) : 2
                const isViewed = m.key === viewedKey
                const showValue = m.total > 0 && (isViewed || m.key === trendMaxKey)
                return (
                  <Link
                    key={m.key}
                    href={`/dashboard?month=${m.key}`}
                    title={`${m.label}: ${fmt(m.total, primaryCurrency)}`}
                    className="flex-1 flex flex-col justify-end items-center gap-1 group min-w-0"
                  >
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 h-3.5 leading-3.5">
                      {showValue ? fmtCompact(m.total) : ''}
                    </span>
                    <div
                      className={`w-full max-w-10 rounded-t-[4px] transition-colors ${
                        isViewed
                          ? 'bg-blue-500'
                          : 'bg-blue-200 dark:bg-blue-900 group-hover:bg-blue-300 dark:group-hover:bg-blue-800'
                      }`}
                      style={{ height: `${barHeight}px` }}
                    />
                    <span
                      className={`text-[10px] ${
                        isViewed
                          ? 'font-semibold text-gray-700 dark:text-gray-200'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {m.short}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {categoryStats.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">By category</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Based on line item categories where available · click a category to see its expenses
              {excludedCount > 0 &&
                ` · excludes ${excludedCount} expense${excludedCount !== 1 ? 's' : ''} in other currencies`}
            </p>
            <div className="space-y-1">
              {categoryStats.map((cat, i) => {
                const pct = monthTotal > 0 ? (cat.total / monthTotal) * 100 : 0
                const row = (
                  <>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{cat.name}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {fmt(cat.total, primaryCurrency)}
                        <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
                          {pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct.toFixed(1)}%`,
                          backgroundColor: cat.color ?? '#94a3b8',
                        }}
                      />
                    </div>
                  </>
                )
                return cat.slug ? (
                  <Link
                    key={i}
                    href={`/categories/${encodeURIComponent(cat.slug)}?month=${viewedKey}`}
                    className="block rounded-lg -mx-2 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {row}
                  </Link>
                ) : (
                  <div key={i} className="-mx-2 px-2 py-1.5">
                    {row}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {topVendors.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Top vendors</h2>
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {topVendors.map((v) => (
                <div key={v.name} className="flex justify-between items-center py-2.5">
                  <div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{v.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {v.count} invoice{v.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {fmt(v.total, primaryCurrency)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent expenses</h2>
            <Link href="/expenses" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              View all
            </Link>
          </div>

          {recentExpenses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">No expenses yet.</p>
              <Link
                href="/"
                className="text-sm text-white bg-blue-600 px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
              >
                Upload your first invoice
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {recentExpenses.map((expense) => {
                const cat = expense.category_id ? catById.get(expense.category_id) : null
                return (
                  <Link
                    key={expense.id}
                    href={`/expenses/${expense.id}`}
                    className="flex justify-between items-start py-3 hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {expense.vendor_name || 'Unknown vendor'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-400 dark:text-gray-500">{fmtDate(expense.invoice_date)}</p>
                        {cat && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">· {cat.name}</span>
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
      </div>
    </div>
  )
}
