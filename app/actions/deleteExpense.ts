'use server'

import { redirect } from 'next/navigation'
import { getServerClient } from '@/app/lib/supabase/server'

export async function deleteExpense(id: string): Promise<{ error: string } | void> {
  let supabase
  try {
    supabase = getServerClient()
  } catch {
    return { error: 'Database is not configured.' }
  }

  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) return { error: error.message }

  redirect('/expenses')
}
