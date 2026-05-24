export const runtime = 'nodejs'

import { getServerClient } from '@/app/lib/supabase/server'
import * as XLSX from 'xlsx'

const CATEGORY_ORDER = [
  'Groceries',
  'Protein',
  'Carbs',
  'Alcohol',
  'Drinks',
  'Nuts & Seeds',
  'Spices / Condiments',
  'Sweets / Snacks',
  'Personal Care',
  'Household',
  'Health / Pharmacy',
  'Transport',
  'Fees / Adjustments',
  'Subscriptions',
  'Shopping',
  'Restaurants',
  'Other',
]

type Expense = {
  id: string
  vendor_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number
  category_id: string | null
}

type ExpenseItem = {
  expense_id: string
  description: string | null
  quantity: number | null
  unit_price: number | null
  amount: number | null
  category_id: string | null
}

type Category = { id: string; name: string }

function monthKey(dateStr: string): string {
  return dateStr.substring(0, 7)
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

function applyNumFmt(ws: XLSX.WorkSheet, row: number, col: number) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  const cell = ws[addr]
  if (cell && cell.t === 'n') cell.z = '#,##0.00'
}

function autoFitCols(data: (string | number | null)[][]): XLSX.ColInfo[] {
  if (data.length === 0) return []
  const numCols = data[0].length
  return Array.from({ length: numCols }, (_, c) => {
    let max = 0
    for (const row of data) {
      const v = row[c]
      const len = v != null ? String(v).length : 0
      if (len > max) max = len
    }
    return { wch: Math.min(max + 2, 50) }
  })
}

export async function GET() {
  let supabase
  try {
    supabase = await getServerClient()
  } catch {
    return new Response('Supabase is not configured.', { status: 500 })
  }

  const catRes = await supabase.from('categories').select('id, name')
  const allCategories = (catRes.data ?? []) as Category[]
  const catById = new Map(allCategories.map((c) => [c.id, c.name]))

  const expRes = await supabase
    .from('expenses')
    .select('id, vendor_name, invoice_number, invoice_date, total_amount, category_id')
    .order('invoice_date', { ascending: true })
    .order('vendor_name', { ascending: true })

  const expenses = (expRes.data ?? []) as Expense[]
  const expMap = new Map(expenses.map((e) => [e.id, e]))

  const expIds = expenses.map((e) => e.id)
  let allItems: ExpenseItem[] = []
  if (expIds.length > 0) {
    const itemsRes = await supabase
      .from('expense_items')
      .select('expense_id, description, quantity, unit_price, amount, category_id')
      .in('expense_id', expIds)
    allItems = (itemsRes.data ?? []) as ExpenseItem[]
  }

  const itemsByExpense = new Map<string, ExpenseItem[]>()
  for (const item of allItems) {
    const list = itemsByExpense.get(item.expense_id) ?? []
    list.push(item)
    itemsByExpense.set(item.expense_id, list)
  }

  // ── Sheet 1: Line Items ──────────────────────────────────────────────────

  const s1Headers = [
    'Month',
    'Invoice Date',
    'Vendor',
    'Invoice Number',
    'Item Description',
    'Category',
    'Quantity',
    'Unit Price (CZK)',
    'Amount (CZK)',
  ]

  const s1Rows: (string | number | null)[][] = []

  for (const expense of expenses) {
    const dateStr = expense.invoice_date ?? ''
    const month = dateStr ? monthLabel(monthKey(dateStr)) : ''
    const vendor = expense.vendor_name ?? ''
    const invoiceNum = expense.invoice_number ?? ''
    const items = itemsByExpense.get(expense.id) ?? []

    if (items.length > 0) {
      for (const item of items) {
        s1Rows.push([
          month,
          dateStr,
          vendor,
          invoiceNum,
          item.description ?? '',
          item.category_id ? (catById.get(item.category_id) ?? '') : '',
          item.quantity,
          item.unit_price,
          item.amount,
        ])
      }
    } else {
      s1Rows.push([
        month,
        dateStr,
        vendor,
        invoiceNum,
        '',
        expense.category_id ? (catById.get(expense.category_id) ?? '') : '',
        null,
        null,
        expense.total_amount,
      ])
    }
  }

  const s1Data = [s1Headers, ...s1Rows]
  const ws1 = XLSX.utils.aoa_to_sheet(s1Data)

  // Number format on Quantity (col 6), Unit Price (col 7), Amount (col 8)
  for (let r = 1; r < s1Data.length; r++) {
    applyNumFmt(ws1, r, 6)
    applyNumFmt(ws1, r, 7)
    applyNumFmt(ws1, r, 8)
  }

  ws1['!cols'] = autoFitCols(s1Data as (string | number | null)[][])

  // ── Sheet 2: Monthly Summary ─────────────────────────────────────────────

  const monthSet = new Set<string>()
  for (const expense of expenses) {
    if (expense.invoice_date) monthSet.add(monthKey(expense.invoice_date))
  }
  const months = [...monthSet].sort()

  // pivot: category name → month key → sum of amounts
  const pivot = new Map<string, Map<string, number>>()
  for (const cat of CATEGORY_ORDER) pivot.set(cat, new Map())

  for (const item of allItems) {
    const expense = expMap.get(item.expense_id)
    if (!expense?.invoice_date) continue
    const mKey = monthKey(expense.invoice_date)
    const rawCat = item.category_id ? (catById.get(item.category_id) ?? 'Other') : 'Other'
    const cat = CATEGORY_ORDER.includes(rawCat) ? rawCat : 'Other'
    const mm = pivot.get(cat)!
    mm.set(mKey, (mm.get(mKey) ?? 0) + (item.amount ?? 0))
  }

  const s2Headers = ['Category', ...months.map(monthLabel), 'Total']
  const s2Rows: (string | number)[][] = []

  for (const cat of CATEGORY_ORDER) {
    const mm = pivot.get(cat)!
    const monthAmounts = months.map((m) => mm.get(m) ?? 0)
    const rowTotal = monthAmounts.reduce((a, b) => a + b, 0)
    s2Rows.push([cat, ...monthAmounts, rowTotal])
  }

  const monthlyTotals = months.map((m) =>
    CATEGORY_ORDER.reduce((sum, cat) => sum + (pivot.get(cat)?.get(m) ?? 0), 0)
  )
  const grandTotal = monthlyTotals.reduce((a, b) => a + b, 0)
  s2Rows.push(['Monthly Total', ...monthlyTotals, grandTotal])

  const s2Data = [s2Headers, ...s2Rows]
  const ws2 = XLSX.utils.aoa_to_sheet(s2Data)

  for (let r = 1; r < s2Data.length; r++) {
    for (let c = 1; c < s2Data[r].length; c++) {
      applyNumFmt(ws2, r, c)
    }
  }

  ws2['!cols'] = autoFitCols(s2Data as (string | number | null)[][])

  // ── Build workbook ───────────────────────────────────────────────────────

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, 'Line Items')
  XLSX.utils.book_append_sheet(wb, ws2, 'Monthly Summary')

  // XLSX.write returns Uint8Array<ArrayBufferLike> which is not directly assignable to
  // BodyInit. Copy into a fresh Uint8Array to get a concrete ArrayBuffer backing.
  const xlsxArr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
  const body = new Uint8Array(xlsxArr)

  const yyyyMM = new Date().toISOString().substring(0, 7)
  return new Response(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="expenses-${yyyyMM}.xlsx"`,
    },
  })
}
