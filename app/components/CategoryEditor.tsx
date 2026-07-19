'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { recategorize, type RecategorizeScope } from '@/app/actions/recategorize'

type CategoryOption = { id: string; name: string; color: string | null }

/**
 * Inline category dropdown. Saving propagates to all items of the same
 * product and stores a learned rule so future scans classify the same way.
 */
export default function CategoryEditor({
  categories,
  value,
  scope,
}: {
  categories: CategoryOption[]
  value: string | null
  scope: RecategorizeScope
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const current = value ? categories.find((c) => c.id === value) : null

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const categoryId = e.target.value || null
    setError(null)
    startTransition(async () => {
      const result = await recategorize({ scope, categoryId })
      if ('error' in result) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: current?.color ?? '#94a3b8' }}
      />
      <select
        value={value ?? ''}
        onChange={handleChange}
        disabled={isPending}
        aria-label="Category"
        className={`text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg pl-1.5 pr-1 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-opacity ${
          isPending ? 'opacity-50' : ''
        }`}
      >
        <option value="">— Uncategorized —</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </span>
  )
}
