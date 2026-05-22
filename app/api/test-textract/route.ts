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
const MAX_BYTES = 10 * 1024 * 1024

const AWS_ERROR_FRIENDLY: Record<string, string> = {
  AccessDeniedException:
    'AWS permission denied. Make sure your IAM user has the textract:AnalyzeExpense permission.',
  BadDocumentException:
    'The document could not be read by Textract. Check that the file is a valid, non-corrupted PDF or image.',
  DocumentTooLargeException:
    'The file is too large for Textract to process inline. Try a smaller file.',
  InvalidParameterException:
    'Textract rejected the file. It may be corrupted, password-protected, or an unsupported variant of PDF/image.',
  UnsupportedDocumentException:
    'This PDF was rejected by Textract. It may be multi-page or generated in a way Textract cannot read directly.',
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

async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: bytes })
    const result = await parser.getText()
    return result.text && result.text.trim().length > 20 ? result.text : null
  } catch (err) {
    console.warn('[pdf-parse] extraction failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

async function buildFallbackResponse(pdfText: string, fileName: string, warningPrefix: string) {
  const { parseRohlíkText } = await import('@/app/lib/rohlíkParser')
  const parsed = parseRohlíkText(pdfText, fileName)
  return Response.json({
    raw: { _source: 'pdf-text-fallback', textSample: pdfText.slice(0, 1500) },
    parsed,
    parseWarning: warningPrefix +
      ' The fallback text parser extracted data from the PDF. Please verify all fields carefully before saving.',
  })
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

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Could not parse the request.', code: 'BadRequest' }, { status: 400 })
  }

  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return Response.json({ error: 'No file was provided.', code: 'MissingFile' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json(
      { error: `"${file.type || 'unknown'}" is not supported. Upload a PDF, PNG, or JPEG.`, code: 'UnsupportedType' },
      { status: 400 }
    )
  }
  if (file.size === 0) {
    return Response.json({ error: 'The selected file is empty.', code: 'EmptyFile' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return Response.json(
      { error: `File is too large (${mb} MB). Maximum is 10 MB.`, code: 'FileTooLarge' },
      { status: 400 }
    )
  }

  const logCtx = { fileName: file.name, fileType: file.type, fileSizeMB: (file.size / (1024 * 1024)).toFixed(2) }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return Response.json({ error: 'Could not read the file.', code: 'ReadError' }, { status: 400 })
  }

  // ── PDF pre-check: try text extraction before calling Textract ────────────
  // For PDFs that are text-based (like Rohlík delivery notes), PDF text parsing
  // is more reliable than Textract. We try it first if we detect a supported format.
  if (file.type === 'application/pdf') {
    console.log('[route] PDF upload — attempting text pre-check:', file.name)
    const pdfText = await extractPdfText(bytes)

    if (pdfText) {
      const { isRohlíkDeliveryNote } = await import('@/app/lib/rohlíkParser')
      if (isRohlíkDeliveryNote(pdfText)) {
        console.log('[route] Rohlík delivery note detected — using PDF text parser directly:', file.name)
        return await buildFallbackResponse(
          pdfText,
          file.name,
          'Parsed using PDF text fallback (Rohlík delivery note detected).'
        )
      }
      console.log('[route] PDF text extracted but not a known delivery note format — proceeding with Textract')
    } else {
      console.log('[route] PDF has no extractable text — proceeding with Textract')
    }
  }

  // ── Call AWS Textract ─────────────────────────────────────────────────────
  let raw: AnalyzeExpenseCommandOutput
  try {
    raw = await client.send(new AnalyzeExpenseCommand({ Document: { Bytes: bytes } }))
  } catch (err) {
    if (isAwsSdkError(err)) {
      console.error('[Textract] AWS error', {
        ...logCtx,
        errorName: err.name,
        errorMessage: err.message,
        requestId: err.$metadata?.requestId,
      })

      // ── Fallback: try PDF text when Textract rejects the document ────────
      if (err.name === 'UnsupportedDocumentException' && file.type === 'application/pdf') {
        console.log('[Textract] UnsupportedDocumentException — attempting PDF text fallback:', file.name)
        const pdfText = await extractPdfText(bytes)

        if (pdfText) {
          console.log('[Textract] fallback text extracted, length:', pdfText.length)
          return await buildFallbackResponse(
            pdfText,
            file.name,
            'Parsed using PDF text fallback because Textract could not read this PDF.'
          )
        }

        return Response.json(
          {
            error:
              'This PDF was rejected by Textract and has no embedded text — it may be a scanned image. ' +
              'Try converting each page to PNG/JPEG and uploading those instead.',
            details: err.message,
            code: err.name,
          },
          { status: 502 }
        )
      }

      const friendly = AWS_ERROR_FRIENDLY[err.name] ?? 'Could not scan invoice. Please try again.'
      return Response.json({ error: friendly, details: err.message, code: err.name }, { status: 502 })
    }

    const message = err instanceof Error ? err.message : String(err)
    console.error('[Textract] unexpected error', { ...logCtx, errorMessage: message })
    return Response.json(
      { error: 'Could not scan invoice due to an unexpected error.', details: message, code: 'UnexpectedError' },
      { status: 500 }
    )
  }

  // ── Parse Textract response ───────────────────────────────────────────────
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

  return Response.json({ raw, parsed, ...(parseWarning ? { parseWarning } : {}) })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

  const found: Record<string, ParsedField> = {}
  for (const f of summaryFields) {
    const t = f.Type?.Text
    if (!t || t === 'OTHER') continue
    if (!found[t]) found[t] = toField(f)
  }

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
