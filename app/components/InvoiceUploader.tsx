'use client'

import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import type { ParsedResult, ScanResult } from '@/app/lib/types'

interface Props {
  onScanComplete: (
    raw: unknown,
    parsed: ParsedResult | null,
    fileName: string,
    parseWarning?: string
  ) => void
}

type ScanError = { code?: string; message: string; details?: string }

type SyncApiResponse = ScanResult & {
  error?: string; details?: string; code?: string; parseWarning?: string
}
type StartApiResponse = { jobId: string; bucket: string; key: string } & {
  error?: string; code?: string
}
type StatusApiResponse =
  | { status: 'IN_PROGRESS' }
  | { status: 'FAILED'; error: string; code?: string }
  | { status: 'SUCCEEDED'; raw: unknown; parsed: ParsedResult | null; parseWarning?: string }

type Phase =
  | { name: 'idle' }
  | { name: 'sync' }
  | { name: 'async_starting' }
  | { name: 'async_polling'; jobId: string; bucket: string; key: string; startedAt: number }

const UNSUPPORTED_CODE = 'UNSUPPORTED_DOCUMENT_RELIABLE_PARSE_FAILED'
const POLL_INTERVAL_MS = 2500
const POLL_TIMEOUT_MS = 120_000

export default function InvoiceUploader({ onScanComplete }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [error, setError] = useState<ScanError | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isScanning = phase.name !== 'idle'

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null)
    setError(null)
  }

  // ── Polling effect ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase.name !== 'async_polling') return

    const { jobId, bucket, key, startedAt } = phase

    async function poll() {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setError({ message: 'Scan timed out after 2 minutes. Please try again.' })
        setPhase({ name: 'idle' })
        return
      }

      let data: StatusApiResponse
      try {
        const url = `/api/scan/status?jobId=${encodeURIComponent(jobId)}&bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`
        const res = await fetch(url)
        data = await res.json()
      } catch {
        setError({ message: 'Network error while checking scan status. Please try again.' })
        setPhase({ name: 'idle' })
        return
      }

      if (data.status === 'IN_PROGRESS') {
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
        return
      }

      if (data.status === 'FAILED') {
        if (data.code === UNSUPPORTED_CODE) {
          setError({ code: UNSUPPORTED_CODE, message: data.error })
        } else {
          setError({ code: data.code, message: data.error })
        }
        setPhase({ name: 'idle' })
        return
      }

      // SUCCEEDED
      setPhase({ name: 'idle' })
      onScanComplete(data.raw, data.parsed, file?.name ?? 'invoice.pdf', data.parseWarning)
    }

    // Start first poll immediately
    poll()

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.name])

  // ── Async start helper ─────────────────────────────────────────────────────
  async function startAsyncScan(scanFile: File) {
    setPhase({ name: 'async_starting' })
    setError(null)

    const form = new FormData()
    form.append('file', scanFile)

    let startData: StartApiResponse
    try {
      const res = await fetch('/api/scan/start', { method: 'POST', body: form })
      startData = await res.json()
      if (!res.ok) {
        // If S3 not configured, async is unavailable — show unsupported error
        const code = startData.code === 'MissingS3Bucket' ? UNSUPPORTED_CODE : startData.code
        setError({ code, message: startData.error ?? 'Could not start async scan.' })
        setPhase({ name: 'idle' })
        return
      }
    } catch {
      setError({ message: 'Network error starting async scan.' })
      setPhase({ name: 'idle' })
      return
    }

    setPhase({
      name: 'async_polling',
      jobId: startData.jobId,
      bucket: startData.bucket,
      key: startData.key,
      startedAt: Date.now(),
    })
  }

  // ── Main scan handler ──────────────────────────────────────────────────────
  async function handleScan() {
    if (!file) {
      setError({ message: 'Please select a file first.' })
      return
    }
    setError(null)
    setPhase({ name: 'sync' })

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch('/api/test-textract', { method: 'POST', body: form })
      const data: SyncApiResponse = await res.json()

      if (!res.ok) {
        // Sync Textract failed — if unsupported, automatically try async
        if (data.code === UNSUPPORTED_CODE && file.type === 'application/pdf') {
          await startAsyncScan(file)
          return
        }
        setError({ code: data.code, message: data.error ?? 'Scanning failed.', details: data.details })
        setPhase({ name: 'idle' })
        return
      }

      setPhase({ name: 'idle' })
      onScanComplete(data.raw, data.parsed, file.name, data.parseWarning)
    } catch {
      setError({ message: 'Network error. Please check your connection and try again.' })
      setPhase({ name: 'idle' })
    }
  }

  // ── Status label ───────────────────────────────────────────────────────────
  function getButtonLabel() {
    switch (phase.name) {
      case 'sync': return 'Scanning…'
      case 'async_starting': return 'Preparing…'
      case 'async_polling': return 'Scanning…'
      default: return 'Scan invoice'
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
            onClick={() => !isScanning && inputRef.current?.click()}
            onKeyDown={(e) => !isScanning && e.key === 'Enter' && inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              isScanning
                ? 'border-gray-100 dark:border-gray-800 cursor-default'
                : 'border-gray-200 dark:border-gray-700 cursor-pointer hover:border-blue-400 dark:hover:border-blue-600'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={handleFileChange}
              disabled={isScanning}
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
            disabled={isScanning || !file}
            className="mt-4 w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {getButtonLabel()}
          </button>

          {/* Async status message */}
          {(phase.name === 'async_starting' || phase.name === 'async_polling') && (
            <div className="mt-4 text-center space-y-1">
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                Scanning multi-page PDF…
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                This uses AWS Textract async and can take up to a minute.
              </p>
              <ProgressDots />
            </div>
          )}

          {!isScanning && (
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-600 text-center">
              Best results: standard invoice PDF, PNG, or JPEG.
              Multi-page PDFs use async scanning automatically.
            </p>
          )}
        </div>

        {error && (
          error.code === UNSUPPORTED_CODE
            ? <UnsupportedDocumentError details={error.details} />
            : (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
                <p className="text-sm text-red-700 dark:text-red-400">{error.message}</p>
                {error.details && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1 opacity-80">{error.details}</p>
                )}
              </div>
            )
        )}
      </div>
    </div>
  )
}

function ProgressDots() {
  return (
    <div className="flex justify-center gap-1 mt-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-blue-600 opacity-60"
          style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:.3}50%{opacity:1} }`}</style>
    </div>
  )
}

function UnsupportedDocumentError({ details }: { details?: string }) {
  return (
    <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-5 py-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          We couldn&apos;t read this document reliably yet.
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
          This PDF format is not fully supported yet. To avoid saving incorrect expenses, please use one of the alternatives below.
        </p>
      </div>
      {details && (
        <p className="text-xs text-amber-600 dark:text-amber-500 font-mono bg-amber-100 dark:bg-amber-900 rounded px-3 py-2">
          {details}
        </p>
      )}
      <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1.5 leading-relaxed">
        <li className="flex items-start gap-2">
          <span className="shrink-0 mt-px">→</span>
          <span>Try uploading the <strong>tax invoice</strong> instead of the delivery note — usually a single-page PDF.</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="shrink-0 mt-px">→</span>
          <span>Try <strong>screenshotting each page</strong> and uploading as PNG or JPEG.</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="shrink-0 mt-px">→</span>
          <span>Support for this format can be added in a future update.</span>
        </li>
      </ul>
    </div>
  )
}
