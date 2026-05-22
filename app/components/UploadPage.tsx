'use client'

import { useState } from 'react'
import InvoiceUploader from './InvoiceUploader'
import ReviewForm from './ReviewForm'
import type { Category, CategoryRule, ParsedResult } from '@/app/lib/types'

interface ScanData {
  raw: unknown
  parsed: ParsedResult | null
  fileName: string
  parseWarning?: string
}

interface Props {
  categories: Category[]
  rules: CategoryRule[]
  fetchError?: string
}

export default function UploadPage({ categories, rules, fetchError }: Props) {
  const [scanData, setScanData] = useState<ScanData | null>(null)

  function handleScanComplete(
    raw: unknown,
    parsed: ParsedResult | null,
    fileName: string,
    parseWarning?: string
  ) {
    setScanData({ raw, parsed, fileName, parseWarning })
  }

  if (scanData) {
    return (
      <ReviewForm
        scanData={scanData}
        categories={categories}
        rules={rules}
        fetchError={fetchError}
        onBack={() => setScanData(null)}
      />
    )
  }

  return <InvoiceUploader onScanComplete={handleScanComplete} />
}
