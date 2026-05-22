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
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Export</h1>
        <p className="text-sm text-gray-500 mb-8">
          Download your expense data for use in spreadsheets or backups.
        </p>

        {/* Period selector */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Date range</p>
          <div className="flex gap-2 flex-wrap">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  period === p.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Export buttons */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4 space-y-4">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">CSV for Google Sheets</p>
                <p className="text-xs text-gray-400 mt-0.5">
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

          <div className="border-t border-gray-50 pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">JSON backup</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Full export with nested line items and category names.
                </p>
              </div>
              <a
                href={`/api/export/json?period=${period}`}
                download
                className="shrink-0 px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-xl hover:bg-gray-900 transition-colors"
              >
                Download JSON
              </a>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-sm text-blue-700 space-y-2">
          <p className="font-medium">How to open in Google Sheets</p>
          <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
            <li>Download the CSV file</li>
            <li>Open Google Sheets → File → Import</li>
            <li>Select the CSV file → Import data</li>
            <li>Czech characters (á, č, ě…) are preserved via UTF-8 encoding</li>
          </ol>
          <p className="text-xs text-blue-500 pt-1">
            Direct Google Sheets sync (OAuth) can be added in a future milestone.
          </p>
        </div>
      </div>
    </div>
  )
}
