import {
  TextractClient,
  AnalyzeExpenseCommand,
  type AnalyzeExpenseCommandOutput,
  type ExpenseField,
  type LineItemGroup,
} from '@aws-sdk/client-textract'
import type { NextRequest } from 'next/server'
import type { ParsedField, ParsedLineItem, ParsedResult } from '@/app/lib/types'
import { applyCzechFallback } from '@/app/lib/czechParser'

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB hard ceiling before even calling AWS

// Human-readable messages for known Textract error codes.
// These are shown directly in the UI, so keep them user-friendly.
const AWS_ERROR_FRIENDLY: Record<string, string> = {
  AccessDeniedException:
    'AWS permission denied. Make sure your IAM user has the textract:AnalyzeExpense permission.',
  BadDocumentException:
    'The document could not be read by Textract. Check that the file is a valid, non-corrupted PDF or image.',
  DocumentTooLargeException:
    'The file is too large for Textract to process inline. Try a smaller file (Textract limit: 5 MB for images, ~3000 pages for PDFs).',
  InvalidParameterException:
    'Textract rejected the file. It may be corrupted, password-protected, or an unsupported variant of PDF/image.',
  UnsupportedDocumentException:
    'Textract does not support this document format. Use a standard PDF, PNG, or JPEG.',
  ProvisionedThroughputExceededException:
    'AWS Textract is throttling requests right now. Wait a few seconds and try again.',
  ThrottlingException:
    'AWS Textract is throttling requests right now. Wait a few seconds and try again.',
  InternalServerError:
    'AWS Textract returned an internal error. This is usually transient — please try again.',
  ServiceUnavailableException:
    'AWS Textract is temporarily unavailable. Please try again shortly.',
}

type AwsSdkError = Error & {
  name: string
  $fault?: 'client' | 'server'
  $metadata?: { httpStatusCode?: number; requestId?: string }
}

function isAwsSdkError(err: unknown): err is AwsSdkError {
  return err instanceof Error && ('$fault' in err || '$metadata' in err)
}

function buildClient() {
  const region = process.env.AWS_REGION
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!region || !accessKeyId || !secretAccessKey) return null
  return new TextractClient({ region, credentials: { accessKeyId, secretAccessKey } })
}

export async function POST(request: NextRequest) {
  const client = buildClient()
  if (!client) {
    return Response.json(
      {
        error: 'AWS credentials are not configured.',
        details: 'AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY must all be set in .env.local',
        code: 'MissingCredentials',
      },
      { status: 500 }
    )
  }

  // ── Parse multipart body ────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Could not parse the request. Please try again.', code: 'BadRequest' }, { status: 400 })
  }

  const file = formData.get('file')

  // ── File validation ─────────────────────────────────────────────────────
  if (!file || !(file instanceof File)) {
    return Response.json({ error: 'No file was provided.', code: 'MissingFile' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json(
      {
        error: `"${file.type || 'unknown'}" is not supported. Please upload a PDF, PNG, or JPEG.`,
        code: 'UnsupportedType',
      },
      { status: 400 }
    )
  }

  if (file.size === 0) {
    return Response.json({ error: 'The selected file is empty.', code: 'EmptyFile' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return Response.json(
      {
        error: `File is too large (${mb} MB). Maximum allowed size is 10 MB.`,
        code: 'FileTooLarge',
      },
      { status: 400 }
    )
  }

  // Safe context for server-side logs — no credentials, no file content
  const logCtx = {
    fileType: file.type,
    fileSizeBytes: file.size,
    fileSizeMB: (file.size / (1024 * 1024)).toFixed(2),
  }

  // ── Read bytes ──────────────────────────────────────────────────────────
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return Response.json({ error: 'Could not read the file.', code: 'ReadError' }, { status: 400 })
  }

  // ── Call AWS Textract ───────────────────────────────────────────────────
  let raw: AnalyzeExpenseCommandOutput
  try {
    raw = await client.send(new AnalyzeExpenseCommand({ Document: { Bytes: bytes } }))
  } catch (err) {
    if (isAwsSdkError(err)) {
      console.error('[Textract] AWS error', {
        ...logCtx,
        errorName: err.name,
        errorMessage: err.message,
        httpStatus: err.$metadata?.httpStatusCode,
        // requestId is safe to log — it is the AWS request trace id, not a secret
        requestId: err.$metadata?.requestId,
      })
      const friendly = AWS_ERROR_FRIENDLY[err.name] ?? 'Could not scan invoice. Please try again.'
      return Response.json(
        { error: friendly, details: err.message, code: err.name },
        { status: 502 }
      )
    }

    // Non-AWS error (network failure, timeout, etc.)
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Textract] unexpected error', { ...logCtx, errorMessage: message })
    return Response.json(
      { error: 'Could not scan invoice due to an unexpected error.', details: message, code: 'UnexpectedError' },
      { status: 500 }
    )
  }

  // ── Parse the response ──────────────────────────────────────────────────
  // Parse failures must not discard a successful Textract response.
  // Return raw + null parsed + a warning so the UI can still open the review form.
  let parsed: ParsedResult | null = null
  let parseWarning: string | undefined
  try {
    parsed = parseExpenseResponse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parse error'
    console.error('[Textract] response parsing failed', { ...logCtx, errorMessage: message })
    parseWarning =
      'Textract returned a response but automatic field extraction failed. ' +
      'You can review the raw response below and fill in the fields manually.'
  }

  return Response.json({
    raw,
    parsed,
    ...(parseWarning ? { parseWarning } : {}),
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toField(f: ExpenseField): ParsedField {
  return {
    value: f.ValueDetection?.Text ?? null,
    confidence: f.ValueDetection?.Confidence ?? null,
    label: f.LabelDetection?.Text ?? null,
  }
}

function parseExpenseResponse(raw: AnalyzeExpenseCommandOutput): ParsedResult | null {
  const docs = raw.ExpenseDocuments ?? []
  if (docs.length === 0) return null

  const doc = docs[0]
  const summaryFields: ExpenseField[] = doc.SummaryFields ?? []
  const lineItemGroups: LineItemGroup[] = doc.LineItemGroups ?? []

  // First pass: standard field types
  const found: Record<string, ParsedField> = {}
  for (const f of summaryFields) {
    const t = f.Type?.Text
    if (!t || t === 'OTHER') continue
    if (!found[t]) found[t] = toField(f)
  }

  // Second pass: Czech fallback for OTHER-typed / unrecognised fields
  const enhanced = applyCzechFallback(summaryFields, found)

  const lineItems: ParsedLineItem[] = lineItemGroups.flatMap((group) =>
    (group.LineItems ?? []).map((item) => {
      const fields: Record<string, string> = {}
      const confs: number[] = []
      for (const f of item.LineItemExpenseFields ?? []) {
        const key = f.Type?.Text
        const val = f.ValueDetection?.Text
        if (key && val) fields[key] = val
        if (f.ValueDetection?.Confidence != null) confs.push(f.ValueDetection.Confidence)
      }
      const avgConf = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : null
      return {
        description: fields['ITEM'] ?? fields['EXPENSE_ROW'] ?? fields['PRODUCT_CODE'] ?? null,
        quantity: fields['QUANTITY'] ?? null,
        unit_price: fields['UNIT_PRICE'] ?? fields['PRICE'] ?? null,
        amount: fields['AMOUNT'] ?? fields['TOTAL'] ?? null,
        tax_amount: fields['TAX'] ?? null,
        confidence: avgConf,
      }
    })
  )

  return {
    vendor: enhanced['VENDOR_NAME'] ?? null,
    invoiceNumber: enhanced['INVOICE_RECEIPT_ID'] ?? null,
    date: enhanced['INVOICE_RECEIPT_DATE'] ?? null,
    total: enhanced['TOTAL'] ?? enhanced['AMOUNT_DUE'] ?? null,
    tax: enhanced['TAX'] ?? null,
    currency: enhanced['CURRENCY'] ?? null,
    lineItems,
  }
}
