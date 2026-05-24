export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { getExpenseAnalysisResult } from '@/app/lib/textractAsync'
import { deleteFromS3 } from '@/app/lib/awsS3'
import { mergeExpenseDocuments } from '@/app/lib/mergeExpenseDocuments'
import { translateTextsToEnglish } from '@/app/lib/deepl'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const jobId = searchParams.get('jobId')
  const bucket = searchParams.get('bucket') ?? ''
  const key = searchParams.get('key') ?? ''

  if (!jobId) {
    return Response.json({ error: 'Missing jobId.', code: 'BadRequest' }, { status: 400 })
  }

  let result
  try {
    result = await getExpenseAnalysisResult(jobId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[scan/status] GetExpenseAnalysis failed:', message)
    return Response.json(
      { status: 'FAILED', error: `Could not check scan status: ${message}`, code: 'StatusCheckFailed' },
      { status: 500 }
    )
  }

  if (result.status === 'IN_PROGRESS') {
    return Response.json({ status: 'IN_PROGRESS' })
  }

  if (result.status === 'FAILED') {
    console.error('[scan/status] Textract job failed:', result.reason)
    return Response.json(
      { status: 'FAILED', error: `Textract job failed: ${result.reason}`, code: 'TextractJobFailed' },
      { status: 502 }
    )
  }

  // ── SUCCEEDED — merge pages, translate, clean up S3 ───────────────────────
  console.log('[scan/status] job succeeded, merging', result.documents.length, 'document(s)')

  const { parsed, warnings } = mergeExpenseDocuments(result.documents)

  // Optionally translate item descriptions
  const descriptions = parsed.lineItems
    .map((li) => li.description)
    .filter((d): d is string => Boolean(d))

  if (descriptions.length > 0) {
    const translations = await translateTextsToEnglish(descriptions)
    if (translations.size > 0) {
      parsed.lineItems = parsed.lineItems.map((li) => {
        const t = li.description ? translations.get(li.description) : undefined
        return t ? { ...li, translated_description: t } : li
      })
    }
  }

  // Delete S3 object now that Textract is done with it
  if (bucket && key) {
    await deleteFromS3(bucket, key)
  }

  // Guard: block if nothing useful was extracted
  const hasUsefulData = Boolean(parsed.total?.value) || parsed.lineItems.length > 0
  if (!hasUsefulData) {
    return Response.json(
      {
        status: 'FAILED',
        error: "We couldn't read this document reliably yet. No useful data was extracted.",
        code: 'UNSUPPORTED_DOCUMENT_RELIABLE_PARSE_FAILED',
      },
      { status: 422 }
    )
  }

  const warningMessage = [
    'Multi-page PDF scanned with AWS Textract async.',
    ...warnings,
    'Please verify all fields before saving.',
  ].join(' ')

  return Response.json({
    status: 'SUCCEEDED',
    raw: { _source: 'textract-async', jobId },
    parsed,
    parseWarning: warningMessage,
  })
}
