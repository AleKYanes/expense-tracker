import type { NextRequest } from 'next/server'
import { getServerClient } from '@/app/lib/supabase/server'

type Expense = {
  id: string
  vendor_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number
  tax_amount: number | null
  currency: string
  category_id: string | null
  source_file_name: string | null
  created_at: string
}

type ExpenseItem = {
  expense_id: string
  description: string | null
  amount: number | null
  category_id: string | null
}

type Category = { id: string; name: string }

const CSV_HEADERS = [
  'expense_id',
  'invoice_date',
  'vendor_name',
  'invoice_number',
  'expense_total',
  'tax_amount',
  'currency',
  'expense_category',
  'item_description',
  'item_amount',
  'item_category',
  'source_file_name',
  'created_at',
] as const

function escapeCSV(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function getPeriodRange(period: string): { from: string | null; to: string | null } {
  const now = new Date()
  if (period === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    return { from, to: null }
  }
  if (period === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
    const to = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    return { from, to }
  }
  return { from: null, to: null }
}

export async function GET(request: NextRequest) {
  let supabase
  try {
    supabase = getServerClient()
  } catch {
    return new Response('Supabase is not configured.', { status: 500 })
  }

  const period = request.nextUrl.searchParams.get('period') ?? 'this_month'
  const range = getPeriodRange(period)

  // Fetch categories
  const catRes = await supabase.from('categories').select('id, name')
  const catById = new Map<string, string>(
    ((catRes.data ?? []) as Category[]).map((c) => [c.id, c.name])
  )

  // Fetch expenses
  let expQuery = supabase
    .from('expenses')
    .select(
      'id, vendor_name, invoice_number, invoice_date, total_amount, tax_amount, currency, category_id, source_file_name, created_at'
    )
    .order('invoice_date', { ascending: false })

  if (range.from) expQuery = expQuery.gte('invoice_date', range.from)
  if (range.to) expQuery = expQuery.lt('invoice_date', range.to)

  const expRes = await expQuery
  const expenses = (expRes.data ?? []) as Expense[]

  if (expenses.length === 0) {
    const csv = '﻿' + CSV_HEADERS.join(',') + '\n'
    return csvResponse(csv, period)
  }

  // Fetch line items
  const expIds = expenses.map((e) => e.id)
  const itemsRes = await supabase
    .from('expense_items')
    .select('expense_id, description, amount, category_id')
    .in('expense_id', expIds)

  const allItems = (itemsRes.data ?? []) as ExpenseItem[]
  const itemsByExpense = new Map<string, ExpenseItem[]>()
  for (const item of allItems) {
    const list = itemsByExpense.get(item.expense_id) ?? []
    list.push(item)
    itemsByExpense.set(item.expense_id, list)
  }

  // Build CSV rows
  const rows: string[] = [CSV_HEADERS.join(',')]

  for (const expense of expenses) {
    const expCategoryName = expense.category_id ? catById.get(expense.category_id) ?? '' : ''
    const items = itemsByExpense.get(expense.id) ?? []

    if (items.length > 0) {
      for (const item of items) {
        const itemCategoryName = item.category_id ? catById.get(item.category_id) ?? '' : ''
        rows.push(
          [
            escapeCSV(expense.id),
            escapeCSV(expense.invoice_date),
            escapeCSV(expense.vendor_name),
            escapeCSV(expense.invoice_number),
            escapeCSV(expense.total_amount),
            escapeCSV(expense.tax_amount),
            escapeCSV(expense.currency),
            escapeCSV(expCategoryName),
            escapeCSV(item.description),
            escapeCSV(item.amount),
            escapeCSV(itemCategoryName),
            escapeCSV(expense.source_file_name),
            escapeCSV(expense.created_at),
          ].join(',')
        )
      }
    } else {
      rows.push(
        [
          escapeCSV(expense.id),
          escapeCSV(expense.invoice_date),
          escapeCSV(expense.vendor_name),
          escapeCSV(expense.invoice_number),
          escapeCSV(expense.total_amount),
          escapeCSV(expense.tax_amount),
          escapeCSV(expense.currency),
          escapeCSV(expCategoryName),
          '',
          '',
          '',
          escapeCSV(expense.source_file_name),
          escapeCSV(expense.created_at),
        ].join(',')
      )
    }
  }

  // UTF-8 BOM ensures Czech characters open correctly in Excel and Google Sheets
  const csv = '﻿' + rows.join('\n')
  return csvResponse(csv, period)
}

function csvResponse(csv: string, period: string): Response {
  const date = new Date().toISOString().split('T')[0]
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="expenses-${period}-${date}.csv"`,
    },
  })
}
