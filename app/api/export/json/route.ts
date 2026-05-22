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
  id: string
  expense_id: string
  description: string | null
  quantity: number | null
  unit_price: number | null
  amount: number | null
  tax_amount: number | null
  category_id: string | null
}

type Category = { id: string; name: string; slug: string; color: string | null }

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
    supabase = await getServerClient()
  } catch {
    return Response.json({ error: 'Supabase is not configured.' }, { status: 500 })
  }

  const period = request.nextUrl.searchParams.get('period') ?? 'this_month'
  const range = getPeriodRange(period)

  const catRes = await supabase.from('categories').select('id, name, slug, color')
  const allCategories = (catRes.data ?? []) as Category[]
  const catById = new Map(allCategories.map((c) => [c.id, c]))

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

  const expIds = expenses.map((e) => e.id)
  let allItems: ExpenseItem[] = []
  if (expIds.length > 0) {
    const itemsRes = await supabase
      .from('expense_items')
      .select('id, expense_id, description, quantity, unit_price, amount, tax_amount, category_id')
      .in('expense_id', expIds)
    allItems = (itemsRes.data ?? []) as ExpenseItem[]
  }

  const itemsByExpense = new Map<string, ExpenseItem[]>()
  for (const item of allItems) {
    const list = itemsByExpense.get(item.expense_id) ?? []
    list.push(item)
    itemsByExpense.set(item.expense_id, list)
  }

  const output = {
    exported_at: new Date().toISOString(),
    period,
    count: expenses.length,
    expenses: expenses.map((expense) => {
      const expCat = expense.category_id ? catById.get(expense.category_id) : null
      const expItems = itemsByExpense.get(expense.id) ?? []
      return {
        id: expense.id,
        vendor_name: expense.vendor_name,
        invoice_number: expense.invoice_number,
        invoice_date: expense.invoice_date,
        total_amount: expense.total_amount,
        tax_amount: expense.tax_amount,
        currency: expense.currency,
        category: expCat ? { id: expCat.id, name: expCat.name, slug: expCat.slug } : null,
        source_file_name: expense.source_file_name,
        created_at: expense.created_at,
        items: expItems.map((item) => {
          const itemCat = item.category_id ? catById.get(item.category_id) : null
          return {
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            amount: item.amount,
            tax_amount: item.tax_amount,
            category: itemCat ? { id: itemCat.id, name: itemCat.name, slug: itemCat.slug } : null,
          }
        }),
      }
    }),
  }

  const date = new Date().toISOString().split('T')[0]
  return new Response(JSON.stringify(output, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="expenses-${period}-${date}.json"`,
    },
  })
}
