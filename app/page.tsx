export const dynamic = 'force-dynamic'

import UploadPage from './components/UploadPage'
import type { Category, CategoryRule } from './lib/types'

async function fetchCategoriesAndRules(): Promise<{
  categories: Category[]
  rules: CategoryRule[]
  fetchError?: string
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const keyAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const keyPub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  console.log('[fetchCategories] env:', {
    NEXT_PUBLIC_SUPABASE_URL: url ? 'SET' : 'MISSING',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: keyAnon ? 'SET' : 'missing',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keyPub ? 'SET' : 'missing',
  })

  if (!url || (!keyAnon && !keyPub)) {
    const msg = 'Supabase env vars not set. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
    console.error('[fetchCategories]', msg)
    return { categories: [], rules: [], fetchError: msg }
  }

  try {
    const { getServerClient } = await import('./lib/supabase/server')
    const supabase = await getServerClient()

    const [catRes, ruleRes] = await Promise.all([
      supabase.from('categories').select('id, name, slug, color').order('name'),
      supabase.from('category_rules').select('category_id, match_text, priority'),
    ])

    if (catRes.error) {
      console.error('[fetchCategories] categories query failed:', catRes.error.message, catRes.error.code)
      return { categories: [], rules: [], fetchError: `categories: ${catRes.error.message}` }
    }
    if (ruleRes.error) {
      console.error('[fetchCategories] category_rules query failed:', ruleRes.error.message, ruleRes.error.code)
      return { categories: [], rules: [], fetchError: `category_rules: ${ruleRes.error.message}` }
    }

    const categories = (catRes.data as Category[]) ?? []
    const rules = (ruleRes.data as CategoryRule[]) ?? []

    console.log(`[fetchCategories] ok — ${categories.length} categories, ${rules.length} rules`)

    return { categories, rules }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[fetchCategories] threw:', msg)
    return { categories: [], rules: [], fetchError: msg }
  }
}

export default async function Home() {
  const { categories, rules, fetchError } = await fetchCategoriesAndRules()
  return <UploadPage categories={categories} rules={rules} fetchError={fetchError} />
}
