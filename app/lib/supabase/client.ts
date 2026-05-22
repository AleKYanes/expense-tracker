import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function resolveKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
}

let instance: SupabaseClient | null = null

export function getBrowserClient(): SupabaseClient {
  if (!instance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = resolveKey()
    if (!url || !key) {
      throw new Error(
        'Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
      )
    }
    instance = createClient(url, key)
  }
  return instance
}
