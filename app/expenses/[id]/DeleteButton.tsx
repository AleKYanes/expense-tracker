'use client'

import { useTransition } from 'react'
import { deleteExpense } from '@/app/actions/deleteExpense'

export default function DeleteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm('Delete this expense and all its line items? This cannot be undone.')) return
    startTransition(async () => {
      const result = await deleteExpense(id)
      if (result && 'error' in result) {
        alert('Failed to delete: ' + result.error)
      }
      // On success, deleteExpense redirects server-side to /expenses
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
