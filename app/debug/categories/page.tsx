export const dynamic = 'force-dynamic'

// DEVELOPMENT DIAGNOSTIC PAGE — safe to leave in, shows no secrets.
// Open at http://localhost:3000/debug/categories

type Row = Record<string, unknown>

async function runDiagnostics() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const keyAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const keyPub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const key = keyAnon || keyPub

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: url ? `SET (${url.slice(0, 30)}...)` : 'MISSING',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: keyAnon ? 'SET' : 'missing',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keyPub ? 'SET' : 'missing',
    resolvedKey: key ? 'resolved' : 'NONE FOUND',
  }

  if (!url || !key) {
    return { env, categories: [], rules: [], errors: ['env vars missing'] }
  }

  let categories: Row[] = []
  let rules: Row[] = []
  const errors: string[] = []

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(url, key)

    const catRes = await supabase
      .from('categories')
      .select('id, name, slug, color')
      .order('name')

    if (catRes.error) {
      errors.push(`categories: [${catRes.error.code}] ${catRes.error.message}`)
    } else {
      categories = (catRes.data ?? []) as Row[]
    }

    const ruleRes = await supabase
      .from('category_rules')
      .select('id, category_id, match_text, language')
      .limit(200)

    if (ruleRes.error) {
      errors.push(`category_rules: [${ruleRes.error.code}] ${ruleRes.error.message}`)
    } else {
      rules = (ruleRes.data ?? []) as Row[]
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  return { env, categories, rules, errors }
}

export default async function DebugCategoriesPage() {
  const { env, categories, rules, errors } = await runDiagnostics()

  const ok = errors.length === 0 && categories.length > 0 && rules.length > 0

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Supabase diagnostic</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Development helper — shows no secret values
          </p>
        </div>

        {/* Status */}
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          ok ? 'bg-green-50 border border-green-200 text-green-700'
             : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {ok
            ? `✓ Supabase connected — ${categories.length} categories, ${rules.length} rules`
            : '✗ Supabase connection has issues — see details below'}
        </div>

        {/* Env vars */}
        <Section title="Environment variables">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-gray-100">
              {Object.entries(env).map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1.5 pr-4 font-mono text-gray-600">{k}</td>
                  <td className={`py-1.5 font-medium ${
                    String(v).includes('MISSING') || String(v).includes('NONE')
                      ? 'text-red-600'
                      : 'text-green-700'
                  }`}>{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* Errors */}
        {errors.length > 0 && (
          <Section title="Errors">
            {errors.map((e, i) => (
              <div key={i} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-mono">
                {e}
              </div>
            ))}
            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <p className="font-semibold">If you see &quot;permission denied&quot;:</p>
              <p>Run this SQL in the Supabase SQL editor to grant the anon role read access:</p>
              <pre className="bg-gray-100 rounded p-3 text-xs overflow-x-auto">{SQL_GRANT}</pre>
            </div>
          </Section>
        )}

        {/* Categories */}
        <Section title={`Categories (${categories.length})`}>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400">None loaded. Run the schema SQL first.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="pb-1 pr-4">name</th>
                  <th className="pb-1 pr-4">slug</th>
                  <th className="pb-1">id</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {categories.slice(0, 5).map((c, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-4">{String(c.name)}</td>
                    <td className="py-1 pr-4 font-mono text-gray-500">{String(c.slug)}</td>
                    <td className="py-1 font-mono text-gray-400">{String(c.id).slice(0, 8)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {categories.length > 5 && (
            <p className="text-xs text-gray-400 mt-1">…and {categories.length - 5} more</p>
          )}
        </Section>

        {/* Rules */}
        <Section title={`Category rules (${rules.length})`}>
          {rules.length === 0 ? (
            <p className="text-sm text-gray-400">None loaded. Run the schema SQL and the add_category_rules.sql patch.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="pb-1 pr-4">match_text</th>
                  <th className="pb-1 pr-4">language</th>
                  <th className="pb-1">category_id</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rules.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-4 font-mono">{String(r.match_text)}</td>
                    <td className="py-1 pr-4 text-gray-500">{String(r.language ?? '—')}</td>
                    <td className="py-1 font-mono text-gray-400">{String(r.category_id).slice(0, 8)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rules.length > 5 && (
            <p className="text-xs text-gray-400 mt-1">…and {rules.length - 5} more</p>
          )}
        </Section>

        {/* What to do next */}
        <Section title="Next steps">
          <ol className="text-xs text-gray-600 list-decimal list-inside space-y-1">
            <li>Confirm env vars are SET above</li>
            <li>If any are missing, add them to <code className="bg-gray-100 px-1 rounded">.env.local</code> and restart <code className="bg-gray-100 px-1 rounded">npm run dev</code></li>
            <li>If you see a permission error, run the GRANT SQL shown above</li>
            <li>If categories show 0, run <code className="bg-gray-100 px-1 rounded">supabase/schema.sql</code> in the Supabase SQL editor</li>
            <li>If rules show 0, also run <code className="bg-gray-100 px-1 rounded">supabase/add_category_rules.sql</code></li>
            <li>Refresh this page to confirm counts</li>
            <li>Then upload an invoice — the review page should show categories</li>
          </ol>
        </Section>
      </div>
    </div>
  )
}

const SQL_GRANT = `-- Grant read access to the anon (public) role
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.category_rules TO anon;

-- Also ensure the app can write expenses and items
GRANT INSERT, UPDATE, DELETE ON public.expenses TO anon;
GRANT INSERT, UPDATE, DELETE ON public.expense_items TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Or to fix everything at once:
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;`

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
      {children}
    </div>
  )
}
