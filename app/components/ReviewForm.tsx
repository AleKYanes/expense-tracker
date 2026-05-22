'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { saveExpense } from '@/app/actions/saveExpense'
import { suggestCategoryId, suggestOverallCategory, matchCategory } from '@/app/lib/categoryMatcher'
import { parseDateString } from '@/app/lib/czechParser'
import { parseMoney } from '@/app/lib/parseMoney'
import type { Category, CategoryRule, ItemDraft, ParsedResult } from '@/app/lib/types'

interface ScanData {
  raw: unknown
  parsed: ParsedResult | null
  fileName: string
  parseWarning?: string
}

interface Props {
  scanData: ScanData
  categories: Category[]
  rules: CategoryRule[]
  fetchError?: string
  onBack: () => void
}


function computedAmount(qty: string, unitPrice: string): string {
  const price = parseMoney(unitPrice)
  if (price == null) return ''
  const q = parseMoney(qty)
  return ((q ?? 1) * price).toFixed(2)
}

function initItems(
  parsed: ParsedResult | null,
  rules: CategoryRule[],
  otherCategoryId: string | undefined
): ItemDraft[] {
  return (parsed?.lineItems ?? [])
    .filter((li) => li.description)
    .map((li) => {
      const amount =
        li.amount?.trim()
          ? li.amount
          : computedAmount(li.quantity ?? '', li.unit_price ?? '')

      // Always resolve to a non-empty string when Other category is available.
      const matched = suggestCategoryId(li.description ?? '', rules)
      const category_id = matched ?? otherCategoryId ?? ''

      return {
        description: li.description ?? '',
        quantity: li.quantity ?? '',
        unit_price: li.unit_price ?? '',
        amount,
        tax_amount: li.tax_amount ?? '',
        category_id,
      }
    })
}

function avgConfidence(parsed: ParsedResult | null): number | null {
  if (!parsed) return null
  const fields = [parsed.vendor, parsed.date, parsed.total, parsed.tax, parsed.currency, parsed.invoiceNumber]
  const confs = fields.map((f) => f?.confidence).filter((c): c is number => c != null)
  if (confs.length === 0) return null
  return confs.reduce((a, b) => a + b, 0) / confs.length
}

export default function ReviewForm({ scanData, categories, rules, fetchError, onBack }: Props) {
  const { raw, parsed, fileName, parseWarning } = scanData
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const otherCategoryId = categories.find((c) => c.slug === 'other')?.id

  const [vendor, setVendor] = useState(parsed?.vendor?.value ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState(parsed?.invoiceNumber?.value ?? '')
  const [invoiceDate, setInvoiceDate] = useState(parseDateString(parsed?.date?.value ?? null))
  const [totalAmount, setTotalAmount] = useState(parsed?.total?.value ?? '')
  const [taxAmount, setTaxAmount] = useState(parsed?.tax?.value ?? '')
  const [currency, setCurrency] = useState(parsed?.currency?.value ?? 'CZK')
  const [categoryId, setCategoryId] = useState(
    suggestOverallCategory(
      parsed?.vendor?.value ?? '',
      (parsed?.lineItems ?? []).map((li) => li.description ?? ''),
      rules
    ) ?? otherCategoryId ?? ''
  )
  const [items, setItems] = useState<ItemDraft[]>(() =>
    initItems(parsed, rules, otherCategoryId)
  )

  const canSave = vendor.trim() !== '' && totalAmount.trim() !== '' && invoiceDate !== ''

  function updateItem(index: number, field: keyof ItemDraft, value: string) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const next = { ...item, [field]: value }
        // Auto-fill an empty amount field when qty or unit_price is edited.
        if ((field === 'quantity' || field === 'unit_price') && !next.amount.trim()) {
          next.amount = computedAmount(next.quantity, next.unit_price)
        }
        return next
      })
    )
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        description: '',
        quantity: '',
        unit_price: '',
        amount: '',
        tax_amount: '',
        category_id: otherCategoryId ?? '',
      },
    ])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    if (!canSave) return
    setSaveError(null)

    const total = parseMoney(totalAmount)
    if (total === null) {
      setSaveError('Total amount must be a valid number.')
      return
    }

    startTransition(async () => {
      const mappedItems = items
        .filter((item) => item.description.trim())
        .map((item) => {
          const qty = parseMoney(item.quantity)
          const unitPrice = parseMoney(item.unit_price)
          const amount =
            parseMoney(item.amount) ?? (unitPrice != null ? (qty ?? 1) * unitPrice : null)

          // Use || (not ??) so empty string also falls through to the Other fallback.
          // The server will do its own matching pass regardless.
          const category_id = item.category_id || otherCategoryId || null

          if (process.env.NODE_ENV === 'development') {
            const catName = categories.find((c) => c.id === category_id)?.name ?? '(none)'
            console.log('[ReviewForm] outgoing item:', {
              description: item.description.trim().slice(0, 50),
              category_id,
              catName,
              amount,
            })
          }

          return {
            description: item.description.trim(),
            quantity: qty ?? (unitPrice != null ? 1 : null),
            unit_price: unitPrice,
            amount,
            tax_amount: parseMoney(item.tax_amount),
            category_id,
            confidence_score: null,
          }
        })

      const result = await saveExpense({
        vendor_name: vendor.trim(),
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        total_amount: total,
        tax_amount: parseMoney(taxAmount),
        currency: currency.trim() || 'CZK',
        category_id: categoryId || null,
        source_file_name: fileName,
        raw_extraction_json: raw,
        confidence_score: avgConfidence(parsed),
        items: mappedItems,
      })

      if ('error' in result) {
        setSaveError(result.error)
      } else {
        router.push(`/expenses/${result.id}`)
      }
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">Review Invoice</h1>
        </div>

        {/* Categories not loaded */}
        {categories.length === 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-xs text-red-700 space-y-1">
            <p className="font-semibold">Categories not loaded — saving will assign Other or null</p>
            {fetchError ? (
              <p><span className="font-medium">Supabase error:</span> {fetchError}</p>
            ) : (
              <p>
                Check that <code className="bg-red-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
                <code className="bg-red-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are set in{' '}
                <code className="bg-red-100 px-1 rounded">.env.local</code>, then restart the dev server.
                If env vars are correct, run the RLS fix SQL in Supabase.
              </p>
            )}
            <p>Open <a href="/debug/categories" className="underline font-medium">/debug/categories</a> to diagnose.</p>
          </div>
        )}

        {/* Warning */}
        <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-xs text-amber-700 leading-relaxed">
          <span className="mt-px shrink-0">⚠</span>
          <span>
            Please review extracted data before saving. OCR may be imperfect, especially for Czech
            invoices.
            {parseWarning && <span className="block mt-1 font-medium">{parseWarning}</span>}
          </span>
        </div>

        {/* Expense fields */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Expense details</h2>
          <div className="space-y-4">
            <Field label="Vendor / Supplier" required confidence={parsed?.vendor?.confidence}>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Vendor name"
                className={inputCls}
              />
            </Field>

            <Field label="Invoice number" confidence={parsed?.invoiceNumber?.confidence}>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2024-001"
                className={inputCls}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Invoice date" required confidence={parsed?.date?.confidence}>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Currency">
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="CZK"
                  className={inputCls}
                />
              </Field>
            </div>

            {(() => {
              const t = parseMoney(totalAmount)
              return t != null && t > 100_000 ? (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">
                  <span className="font-semibold">Unusually high amount: {t.toLocaleString('cs-CZ')} {currency}.</span>{' '}
                  If the decimal separator was misread (e.g. comma stripped), please correct the total below.
                </div>
              ) : null
            })()}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Total amount" required confidence={parsed?.total?.confidence}>
                <input
                  type="text"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
              </Field>
              <Field label="Tax amount" confidence={parsed?.tax?.confidence}>
                <input
                  type="text"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Overall category">
              <CategorySelect value={categoryId} onChange={setCategoryId} categories={categories} />
            </Field>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Line items</h2>
              {items.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Category per item drives dashboard totals
                </p>
              )}
              {process.env.NODE_ENV === 'development' && (
                <p className="text-xs font-mono text-purple-500 mt-0.5">
                  [dev] {categories.length} cats · {rules.length} rules · other={otherCategoryId ?? 'MISSING'}
                </p>
              )}
            </div>
            <button
              onClick={addItem}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add item
            </button>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-4">
              No line items extracted. Category totals will use the overall expense category above.
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(i, 'description', e.target.value)}
                      placeholder="Description"
                      className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => removeItem(i)}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none mt-1.5 shrink-0"
                      aria-label="Remove item"
                    >
                      ×
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      placeholder="Qty"
                      className={smallInputCls}
                    />
                    <input
                      type="text"
                      value={item.unit_price}
                      onChange={(e) => updateItem(i, 'unit_price', e.target.value)}
                      placeholder="Unit price"
                      className={smallInputCls}
                    />
                    <input
                      type="text"
                      value={item.amount}
                      onChange={(e) => updateItem(i, 'amount', e.target.value)}
                      placeholder="Amount"
                      className={smallInputCls}
                    />
                  </div>
                  <CategorySelect
                    value={item.category_id}
                    onChange={(v) => updateItem(i, 'category_id', v)}
                    categories={categories}
                    small
                  />
                  {process.env.NODE_ENV === 'development' && (() => {
                    const m = matchCategory(item.description, rules)
                    const catName = categories.find((c) => c.id === item.category_id)?.name ?? '(none)'
                    return (
                      <div className="text-xs font-mono bg-blue-50 text-blue-600 rounded px-2 py-1 leading-relaxed">
                        <span>cat: <strong>{catName}</strong></span>
                        {m ? (
                          <span className="ml-2 text-blue-400">
                            via &quot;{m.match_text}&quot; p={m.priority}
                          </span>
                        ) : (
                          <span className="ml-2 text-blue-300">→ no match, using Other</span>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Raw JSON */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showRaw ? '▲ Hide raw JSON' : '▶ Show raw Textract response'}
          </button>
          {showRaw && (
            <pre className="mt-3 bg-gray-50 rounded-xl p-4 text-xs text-gray-500 overflow-auto max-h-80 whitespace-pre-wrap break-all">
              {JSON.stringify(raw, null, 2)}
            </pre>
          )}
        </div>

        {/* Error */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || isPending}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Saving…' : 'Save expense'}
          </button>
        </div>

        {!canSave && (
          <p className="text-xs text-gray-400 text-center mt-3">
            Vendor, date, and total amount are required to save.
          </p>
        )}
      </div>
    </div>
  )
}

const inputCls =
  'w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500'

const smallInputCls =
  'w-full text-xs bg-white border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'

function Field({
  label,
  required,
  confidence,
  children,
}: {
  label: string
  required?: boolean
  confidence?: number | null
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <label className="text-xs font-medium text-gray-500">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {confidence != null && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              confidence >= 80
                ? 'bg-green-50 text-green-600'
                : confidence >= 50
                ? 'bg-amber-50 text-amber-600'
                : 'bg-red-50 text-red-500'
            }`}
          >
            {Math.round(confidence)}%
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function CategorySelect({
  value,
  onChange,
  categories,
  small,
}: {
  value: string
  onChange: (v: string) => void
  categories: Category[]
  small?: boolean
}) {
  const cls = small
    ? 'w-full text-xs bg-white border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500'
    : inputCls

  return (
    <select
      value={value}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      className={cls}
    >
      <option value="">— Uncategorized —</option>
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
        </option>
      ))}
    </select>
  )
}
