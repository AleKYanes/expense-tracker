// Force Node.js runtime — AWS SDK and pdf-parse both require it.
export const runtime = 'nodejs'

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
import { extractPdfText } from '@/app/lib/pdfText'
import { translateTextsToEnglish } from '@/app/lib/deepl'
import { parseMoney } from '@/app/lib/parseMoney'

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const MAX_BYTES = 10 * 1024 * 1024

const AWS_ERROR_FRIENDLY: Record<string, string> = {
  AccessDeniedException:
    'AWS permission denied. Make sure your IAM user has textract:AnalyzeExpense permission.',
  BadDocumentException:
    'The document could not be read by Textract. Check that the file is a valid, non-corrupted PDF or image.',
  DocumentTooLargeException:
    'The file is too large for Textract to process inline. Try a smaller file.',
  InvalidParameterException:
    'Textract rejected the file. It may be corrupted, password-protected, or an unsupported PDF variant.',
  UnsupportedDocumentException:
    'This PDF was rejected by Textract. It may be multi-page or generated in a way Textract cannot read.',
  ProvisionedThroughputExceededException:
    'AWS Textract is throttling requests. Wait a few seconds and try again.',
  ThrottlingException:
    'AWS Textract is throttling requests. Wait a few seconds and try again.',
  InternalServerError:
    'AWS Textract returned an internal error. This is usually transient — please try again.',
  ServiceUnavailableException:
    'AWS Textract is temporarily unavailable. Please try again shortly.',
}

const UNSUPPORTED_RELIABLE = 'UNSUPPORTED_DOCUMENT_RELIABLE_PARSE_FAILED'

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

// ── Fallback validation ───────────────────────────────────────────────────────

/**
 * Checks that a fallback-parsed result is reliable enough to send to ReviewForm.
 * Returns a human-readable reason if it fails, null if it passes.
 *
 * Requirements:
 * - Total must be a positive number.
 * - At least 3 line items must have both a non-empty description and a parseable amount.
 */
function validateFallbackParsed(parsed: ParsedResult | null): string | null {
  if (!parsed) return 'Parser returned no data.'

  const total = parseMoney(parsed.total?.value ?? null)
  if (!total || total <= 0) {
    return 'Could not extract a valid total amount from this document.'
  }

  const validItems = parsed.lineItems.filter((li) => {
    if (!li.description?.trim()) return false
    const amt = parseMoney(li.amount ?? null)
    return amt !== null
  })

  if (validItems.length < 3) {
    return (
      `Only ${validItems.length} valid line item(s) could be extracted ` +
      `(minimum 3 required). The document layout may not be supported yet.`
    )
  }

  return null
}

// ── Translation ───────────────────────────────────────────────────────────────

async function attachTranslations(parsed: ParsedResult | null): Promise<ParsedResult | null> {
  if (!parsed || parsed.lineItems.length === 0) return parsed

  const descriptions = parsed.lineItems
    .map((li) => li.description)
    .filter((d): d is string => Boolean(d))

  const translations = await translateTextsToEnglish(descriptions)
  if (translations.size === 0) return parsed

  return {
    ...parsed,
    lineItems: parsed.lineItems.map((li) => {
      const t = li.description ? translations.get(li.description) : undefined
      return t ? { ...li, translated_description: t } : li
    }),
  }
}

// ── PDF fallback ──────────────────────────────────────────────────────────────

type FallbackResult =
  | { ok: true; raw: unknown; parsed: ParsedResult | null }
  | { ok: false; reason: string }
  | null  // not a recognised format or text extraction failed — caller tries Textract

async function tryPdfFallback(bytes: Uint8Array, fileName: string): Promise<FallbackResult> {
  let pdfText: string
  try {
    pdfText = await extractPdfText(bytes)
  } catch (pdfErr) {
    console.warn('[pdf-fallback] text extraction threw:', pdfErr instanceof Error ? pdfErr.message : String(pdfErr))
    return null
  }

  if (!pdfText || pdfText.trim().length < 20) {
    console.log('[pdf-fallback] extracted text too short, skipping')
    return null
  }

  const { isRohlíkDeliveryNote, parseRohlíkText } = await import('@/app/lib/rohlíkParser')

  if (!isRohlíkDeliveryNote(pdfText)) {
    console.log('[pdf-fallback] not a recognised delivery note format')
    return null
  }

  console.log('[pdf-fallback] Rohlík delivery note detected — parsing:', fileName)
  const parsed = parseRohlíkText(pdfText, fileName)

  const validationError = validateFallbackParsed(parsed)
  if (validationError) {
    console.warn('[pdf-fallback] validation failed:', validationError)
    return { ok: false, reason: validationError }
  }

  // Validation passed — translate and return.
  const parsedWithTranslations = await attachTranslations(parsed)
  return {
    ok: true,
    raw: { _source: 'pdf-text-fallback', textSample: pdfText.slice(0, 1500) },
    parsed: parsedWithTranslations,
  }
}

function unsupportedResponse(reason: string) {
  return Response.json(
    {
      error: "We couldn't read this document reliably yet.",
      details: reason,
      code: UNSUPPORTED_RELIABLE,
    },
    { status: 422 }
  )
}

// ── Route ─────────────────────────────────────────────────────────────────────

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
    return Response.json({ error: `File is too large (${mb} MB). Maximum is 10 MB.`, code: 'FileTooLarge' }, { status: 400 })
  }

  const logCtx = { fileName: file.name, fileType: file.type, fileSizeMB: (file.size / (1024 * 1024)).toFixed(2) }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return Response.json({ error: 'Could not read the file.', code: 'ReadError' }, { status: 400 })
  }

  // ── PDF pre-check ─────────────────────────────────────────────────────────
  // For text-based PDFs we recognise (e.g. Rohlík delivery notes), try the
  // text parser first. If it succeeds validation we skip Textract entirely.
  // If it fails validation we return a clear "unsupported" error immediately
  // rather than forwarding to Textract (which would also fail).
  if (file.type === 'application/pdf') {
    console.log('[route] PDF — trying text pre-check:', file.name)
    const fallback = await tryPdfFallback(bytes, file.name)

    if (fallback !== null) {
      if (!fallback.ok) {
        // Recognised format but parsing quality was too low to trust.
        return unsupportedResponse(fallback.reason)
      }
      return Response.json({
        raw: fallback.raw,
        parsed: fallback.parsed,
        parseWarning:
          'Parsed using PDF text fallback (Rohlík delivery note detected). ' +
          'Please verify all fields carefully before saving.',
      })
    }

    // null → not a recognised format, proceed with Textract.
    console.log('[route] not a recognised delivery note — proceeding with Textract:', file.name)
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

      // Textract rejected the document — try PDF text fallback as a last resort.
      if (err.name === 'UnsupportedDocumentException' && file.type === 'application/pdf') {
        console.log('[Textract] UnsupportedDocumentException — trying PDF text fallback:', file.name)
        const fallback = await tryPdfFallback(bytes, file.name)

        if (fallback !== null) {
          if (!fallback.ok) {
            return unsupportedResponse(fallback.reason)
          }
          return Response.json({
            raw: fallback.raw,
            parsed: fallback.parsed,
            parseWarning:
              'Parsed using PDF text fallback because Textract could not read this PDF. ' +
              'Please verify all fields carefully before saving.',
          })
        }

        // Fallback also produced nothing useful — hard block.
        return unsupportedResponse(
          'This PDF was rejected by Textract and could not be parsed by the text fallback. ' +
          'Try uploading a standard single-page invoice PDF, or convert pages to PNG/JPEG.'
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
    parsed = await attachTranslations(parseExpenseResponse(raw))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parse error'
    console.error('[Textract] response parsing failed', { ...logCtx, errorMessage: message })
    parseWarning =
      'Textract returned a response but automatic field extraction failed. ' +
      'You can review the raw response below and fill in the fields manually.'
  }

  return Response.json({ raw, parsed, ...(parseWarning ? { parseWarning } : {}) })
}

// ── Textract response parser ──────────────────────────────────────────────────

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
