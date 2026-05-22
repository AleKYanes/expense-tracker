'use client'

import { useState } from 'react'

type Period = 'this_month' | 'last_month' | 'all'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'all', label: 'All time' },
]

export default function ExportPage() {
  const [period, setPeriod] = useState<Period>('this_month')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Export</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          Download your expense data for use in spreadsheets or backups.
        </p>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 mb-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Date range</p>
          <div className="flex gap-2 flex-wrap">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  period === p.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 mb-4 space-y-4">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">CSV for Google Sheets</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  UTF-8, one row per line item. Open directly in Google Sheets or Excel.
                </p>
              </div>
              <a
                href={`/api/export/csv?period=${period}`}
                download
                className="shrink-0 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-colors"
              >
                Download CSV
              </a>
            </div>
          </div>

          <div className="border-t border-gray-50 dark:border-gray-800 pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">JSON backup</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Full export with nested line items and category names.
                </p>
              </div>
              <a
                href={`/api/export/json?period=${period}`}
                download
                className="shrink-0 px-4 py-2 bg-gray-800 dark:bg-gray-700 text-white text-sm font-medium rounded-xl hover:bg-gray-900 dark:hover:bg-gray-600 transition-colors"
              >
                Download JSON
              </a>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-2xl p-5 text-sm text-blue-700 dark:text-blue-300 space-y-2">
          <p className="font-medium">How to open in Google Sheets</p>
          <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
            <li>Download the CSV file</li>
            <li>Open Google Sheets → File → Import</li>
            <li>Select the CSV file → Import data</li>
            <li>Czech characters (á, č, ě…) are preserved via UTF-8 encoding</li>
          </ol>
          <p className="text-xs text-blue-500 dark:text-blue-400 pt-1">
            Direct Google Sheets sync (OAuth) can be added in a future milestone.
          </p>
        </div>
      </div>
    </div>
  )
}
