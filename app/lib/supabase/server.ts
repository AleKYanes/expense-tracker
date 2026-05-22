import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function getServerClient() {
  const cookieStore = await cookies()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set in .env.local')
  if (!key)
    throw new Error(
      'Supabase key is not set. Add NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
    )

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // setAll is called from Server Components where cookies can't be set.
          // The middleware handles session refresh.
        }
      },
    },
  })
}
