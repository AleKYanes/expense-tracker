'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from './ThemeProvider'
import { getBrowserClient } from '@/app/lib/supabase/client'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/export', label: 'Export' },
  { href: '/', label: '+ New', exact: true },
]

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggle } = useTheme()

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
  }

  async function handleSignOut() {
    const supabase = getBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Don't show nav links on the login page.
  const isLoginPage = pathname === '/login'

  return (
    <nav className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
      <div className="max-w-2xl mx-auto px-4 flex items-center gap-1 h-11 overflow-x-auto">
        {!isLoginPage && NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              isActive(link.href, link.exact)
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {link.label}
          </Link>
        ))}
        <div className="flex-1" />
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="shrink-0 px-2 py-1.5 rounded-lg text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
        {!isLoginPage && (
          <button
            onClick={handleSignOut}
            className="shrink-0 px-2 py-1.5 rounded-lg text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            Sign out
          </button>
        )}
      </div>
    </nav>
  )
}
