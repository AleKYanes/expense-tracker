'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/export', label: 'Export' },
  { href: '/', label: '+ New', exact: true },
]

export default function NavBar() {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav className="sticky top-0 z-10 bg-white border-b border-gray-100">
      <div className="max-w-2xl mx-auto px-4 flex items-center gap-1 h-11 overflow-x-auto">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              isActive(link.href, link.exact)
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
