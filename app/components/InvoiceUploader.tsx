'use client'

import { useState, useRef, type ChangeEvent } from 'react'
import type { ParsedResult, ScanResult } from '@/app/lib/types'

interface Props {
  onScanComplete: (
    raw: unknown,
    parsed: ParsedResult | null,
    fileName: string,
    parseWarning?: string
  ) => void
}

type ScanError = { message: string; details?: string }

type ApiResponse = ScanResult & {
  error?: string
  details?: string
  code?: string
  parseWarning?: string
}

export default function InvoiceUploader({ onScanComplete }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ScanError | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null)
    setError(null)
  }

  async function handleScan() {
    if (!file) {
      setError({ message: 'Please select a file first.' })
      return
    }
    setLoading(true)
    setError(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/test-textract', { method: 'POST', body: form })
      const data: ApiResponse = await res.json()

      if (!res.ok) {
        setError({ message: data.error ?? 'Scanning failed. Please try again.', details: data.details })
        return
      }

      onScanComplete(data.raw, data.parsed, file.name, data.parseWarning)
    } catch {
      setError({ message: 'Network error. Please check your connection and try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Expense Tracker</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Upload an invoice to extract and save expense data.</p>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 mb-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Upload invoice</p>

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={handleFileChange}
            />
            {file ? (
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{file.name}</p>
            ) : (
              <>
                <p className="text-sm text-gray-400 dark:text-gray-500">Click to choose a file</p>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">PDF · PNG · JPG · JPEG · max 10 MB</p>
              </>
            )}
          </div>

          <button
            onClick={handleScan}
            disabled={loading || !file}
            className="mt-4 w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Scanning…' : 'Scan invoice'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
            <p className="text-sm text-red-700 dark:text-red-400">{error.message}</p>
            {error.details && (
              <p className="text-xs text-red-500 dark:text-red-500 mt-1 opacity-80">{error.details}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
