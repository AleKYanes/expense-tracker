export const dynamic = 'force-dynamic'

import Link from 'next/link'
import DeleteButton from './DeleteButton'

type Category = { id: string; name: string; color: string | null }

type ExpenseItem = {
  id: string
  description: string | null
  quantity: number | null
  unit_price: number | null
  amount: number | null
  tax_amount: number | null
  category_id: string | null
}

type Expense = {
  id: string
  vendor_name: string
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number
  tax_amount: number | null
  currency: string
  category_id: string | null
  source_file_name: string | null
  raw_extraction_json: unknown
  confidence_score: number | null
  created_at: string
}

function fmt(amount: number | null, currency: string) {
  if (amount == null) return '—'
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
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}

export default async function ExpenseDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let expense: Expense | null = null
  let items: ExpenseItem[] = []
  let categories: Category[] = []
  let dbError: string | null = null

  try {
    const { getServerClient } = await import('@/app/lib/supabase/server')
    const supabase = getServerClient()

    const [expRes, catRes] = await Promise.all([
      supabase
        .from('expenses')
        .select(
          'id, vendor_name, invoice_number, invoice_date, total_amount, tax_amount, currency, category_id, source_file_name, raw_extraction_json, confidence_score, created_at'
        )
        .eq('id', id)
        .single(),
      supabase.from('categories').select('id, name, color'),
    ])

    if (expRes.error) throw expRes.error
    expense = expRes.data as Expense
    categories = (catRes.data ?? []) as Category[]

    const itemsRes = await supabase
      .from('expense_items')
      .select('id, description, quantity, unit_price, amount, tax_amount, category_id')
      .eq('expense_id', id)
      .order('created_at')

    items = (itemsRes.data ?? []) as ExpenseItem[]
  } catch (err) {
    dbError = err instanceof Error ? err.message : 'Failed to load expense.'
  }

  const catById = new Map(categories.map((c) => [c.id, c]))

  if (dbError || !expense) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Link href="/expenses" className="text-sm text-gray-400 hover:text-gray-600">
            ← Back to expenses
          </Link>
          <div className="mt-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {dbError ?? 'Expense not found.'}
          </div>
        </div>
      </div>
    )
  }

  const expenseCat = expense.category_id ? catById.get(expense.category_id) : null

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/expenses" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Expenses
          </Link>
          <DeleteButton id={expense.id} />
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {expense.vendor_name || 'Unknown vendor'}
          </h1>
          {expense.invoice_number && (
            <p className="text-sm text-gray-400 mb-4">Invoice #{expense.invoice_number}</p>
          )}

          <dl className="divide-y divide-gray-50">
            <Row label="Invoice date" value={fmtDate(expense.invoice_date)} />
            <Row
              label="Total amount"
              value={fmt(expense.total_amount, expense.currency)}
              bold
            />
            {expense.tax_amount != null && (
              <Row label="Tax amount" value={fmt(expense.tax_amount, expense.currency)} />
            )}
            <Row label="Currency" value={expense.currency || 'CZK'} />
            {expenseCat && (
              <Row label="Category" value={expenseCat.name} />
            )}
            {expense.source_file_name && (
              <Row label="Source file" value={expense.source_file_name} />
            )}
            {expense.confidence_score != null && (
              <Row
                label="Extraction confidence"
                value={`${Math.round(expense.confidence_score)}%`}
              />
            )}
          </dl>
        </div>

        {/* Line items */}
        {items.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Line items ({items.length})
            </h2>
            <div className="space-y-2">
              {items.map((item) => {
                const itemCat = item.category_id ? catById.get(item.category_id) : null
                return (
                  <div
                    key={item.id}
                    className="bg-gray-50 rounded-xl px-4 py-3"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <p className="text-sm text-gray-800 flex-1">
                        {item.description || '—'}
                      </p>
                      <p className="text-sm font-medium text-gray-900 shrink-0">
                        {fmt(item.amount, expense.currency)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {item.quantity != null && (
                        <span className="text-xs text-gray-400">Qty: {item.quantity}</span>
                      )}
                      {item.unit_price != null && (
                        <span className="text-xs text-gray-400">
                          Unit: {fmt(item.unit_price, expense.currency)}
                        </span>
                      )}
                      {itemCat && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: itemCat.color ?? '#94a3b8' }}
                        >
                          {itemCat.name}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Raw JSON */}
        <RawJsonCollapsible raw={expense.raw_extraction_json} />
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="flex justify-between items-baseline py-2.5">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className={`text-sm text-right ${bold ? 'font-bold text-gray-900' : 'text-gray-800'}`}>
        {value}
      </dd>
    </div>
  )
}

function RawJsonCollapsible({ raw }: { raw: unknown }) {
  // Server component — render as a details/summary element (no JS needed)
  return (
    <details className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
        Show raw Textract response
      </summary>
      <pre className="mt-3 bg-gray-50 rounded-xl p-4 text-xs text-gray-500 overflow-auto max-h-80 whitespace-pre-wrap break-all">
        {JSON.stringify(raw, null, 2)}
      </pre>
    </details>
  )
}
