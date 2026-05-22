import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolves the Supabase anon/publishable key from either of the two common
 * environment variable names so the app works regardless of which name was set:
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY        (standard Supabase docs + dashboard)
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (renamed in some Supabase versions)
 */
function resolveKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
}

export function getServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = resolveKey()

  if (process.env.NODE_ENV === 'development') {
    console.log('[supabase/server] env check:', {
      NEXT_PUBLIC_SUPABASE_URL: url ? 'SET' : 'MISSING',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'missing',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        ? 'SET'
        : 'missing',
    })
  }

  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not set in .env.local'
    )
  }
  if (!key) {
    throw new Error(
      'Supabase key is not set. Add either NEXT_PUBLIC_SUPABASE_ANON_KEY or ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local'
    )
  }

  return createClient(url, key)
}
