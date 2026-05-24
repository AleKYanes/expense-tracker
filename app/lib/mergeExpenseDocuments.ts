/**
 * Merges multiple Textract ExpenseDocuments (from async analysis) into one ParsedResult.
 *
 * Textract async analysis returns one ExpenseDocument per detected "receipt" on each page.
 * For a multi-page invoice we want to merge everything into a single review draft.
 */
import type { ExpenseDocument, ExpenseField, LineItemGroup } from '@aws-sdk/client-textract'
import type { ParsedField, ParsedLineItem, ParsedResult } from './types'
import { applyCzechFallback } from './czechParser'
import { parseMoney } from './parseMoney'
import { parseRohlikLines } from './rohlíkParser'

function toField(f: ExpenseField): ParsedField {
  return {
    value: f.ValueDetection?.Text ?? null,
    confidence: f.ValueDetection?.Confidence ?? null,
    label: f.LabelDetection?.Text ?? null,
  }
}

function extractEnhancedFields(doc: ExpenseDocument): Record<string, ParsedField> {
  const summaryFields: ExpenseField[] = doc.SummaryFields ?? []
  const found: Record<string, ParsedField> = {}
  for (const f of summaryFields) {
    const t = f.Type?.Text
    if (!t || t === 'OTHER') continue
    if (!found[t]) found[t] = toField(f)
  }
  return applyCzechFallback(summaryFields, found)
}

function extractLineItems(groups: LineItemGroup[]): ParsedLineItem[] {
  return groups.flatMap((group) =>
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
}

// ── Rohlik-specific helpers ───────────────────────────────────────────────────

// Textract treats each visual row (including weight rows) as a separate LineItem.
// For Rohlik delivery notes we re-process through rohlikParser which consolidates
// all weight rows for a product into a single item.

const ROHLIK_WEIGHT_ROW_RE = /^\d+[.,]\d+\s*kg\s*[×xX]?\s*CZK\d+[.,]\d+\/kg/i

function isRohlikDoc(vendor: ParsedField | null, docs: ExpenseDocument[]): boolean {
  if (/rohli[ck]|velk[aá]\s*pecka/i.test(vendor?.value ?? '')) return true
  // Fallback: check ITEM descriptions for the Rohlik weight-row pattern
  for (const doc of docs) {
    for (const group of doc.LineItemGroups ?? []) {
      for (const item of group.LineItems ?? []) {
        for (const f of item.LineItemExpenseFields ?? []) {
          if (f.Type?.Text === 'ITEM' || f.Type?.Text === 'EXPENSE_ROW') {
            if (ROHLIK_WEIGHT_ROW_RE.test(f.ValueDetection?.Text ?? '')) return true
          }
        }
      }
    }
  }
  return false
}

function extractRawLines(docs: ExpenseDocument[]): string[] {
  const WEIGHT_ROW_QUICK = /^\d+[.,]\d+\s*kg\s*[×xX]?\s*CZK/i
  const STD_PRICE_QUICK = /^\d+\s*[×xX]\s*CZK/i

  function isPriceLine(text: string): boolean {
    return WEIGHT_ROW_QUICK.test(text) || STD_PRICE_QUICK.test(text) || /^return packages/i.test(text)
  }

  // EXPENSE_ROW is Textract's complete row text including embedded price/weight
  // sub-lines joined by \n (e.g. "Product name\n2x CZK… CZK…" or
  // "Name\n0.595 kg X CZK…/kg CZK…\n0.485 kg X …"). Split each field on \n
  // and push every sub-line as its own geometry block. A tiny top offset
  // (0.001 per sub-line) keeps them in source order after the global sort, and
  // the merge step below re-joins adjacent description fragments while leaving
  // price and weight lines as separate entries for rohlikParser.
  const blocks: Array<{ text: string; top: number }> = []

  for (const doc of docs) {
    for (const group of doc.LineItemGroups ?? []) {
      for (const item of group.LineItems ?? []) {
        const byType: Record<string, ExpenseField> = {}
        for (const f of item.LineItemExpenseFields ?? []) {
          const k = f.Type?.Text
          if (k && !byType[k]) byType[k] = f
        }
        const descField = byType['EXPENSE_ROW'] ?? byType['ITEM'] ?? byType['PRODUCT_CODE']
        if (!descField) continue
        const text = descField.ValueDetection?.Text
        if (!text) continue
        const pageOffset = (descField.PageNumber ?? 1) - 1
        const boxTop = descField.ValueDetection?.Geometry?.BoundingBox?.Top ?? 0
        const top = pageOffset + boxTop

        const subLines = text.split('\n').map((l) => l.trim()).filter(Boolean)
        for (let si = 0; si < subLines.length; si++) {
          blocks.push({ text: subLines[si], top: top + si * 0.001 })
        }
      }
    }
  }

  blocks.sort((a, b) => a.top - b.top)

  // Deduplicate weight rows. A multi-line EXPENSE_ROW is split above into
  // sub-lines, but Textract also emits the same weight rows as standalone
  // LineItems — so each weight row appears twice. Walk in sorted order and
  // drop any weight row whose text was already seen.
  const seenWeightRows = new Set<string>()
  const deduped: typeof blocks = []
  for (const block of blocks) {
    if (WEIGHT_ROW_QUICK.test(block.text)) {
      if (seenWeightRows.has(block.text)) continue
      seenWeightRows.add(block.text)
    }
    deduped.push(block)
  }

  // Merge consecutive non-price blocks within 0.008 top-units of each other.
  // This re-joins description fragments split by Textract (or by the \n split
  // above for multi-word descriptions) while keeping price/weight lines separate.
  const MERGE_THRESHOLD = 0.008
  const merged: Array<{ text: string; lastTop: number }> = []
  for (const block of deduped) {
    const prev = merged.length > 0 ? merged[merged.length - 1] : null
    if (
      prev !== null &&
      !isPriceLine(block.text) &&
      !isPriceLine(prev.text) &&
      Math.abs(block.top - prev.lastTop) < MERGE_THRESHOLD
    ) {
      prev.text = prev.text + ' ' + block.text
      prev.lastTop = block.top
    } else {
      merged.push({ text: block.text, lastTop: block.top })
    }
  }

  const lines = merged.map((b) => b.text)
  console.log('[mergeExpenseDocuments] sorted rawLines:', lines)
  return lines
}

export function mergeExpenseDocuments(
  docs: ExpenseDocument[]
): { parsed: ParsedResult; warnings: string[] } {
  const warnings: string[] = []
  const empty: ParsedResult = {
    vendor: null, invoiceNumber: null, date: null,
    total: null, tax: null, currency: null, lineItems: [],
  }

  if (docs.length === 0) {
    return { parsed: empty, warnings: ['No expense documents returned from Textract.'] }
  }

  const allFields = docs.map(extractEnhancedFields)

  // ── Vendor: highest-confidence non-empty value ────────────────────────────
  let vendor: ParsedField | null = null
  for (const f of allFields) {
    const v = f['VENDOR_NAME']
    if (v?.value?.trim()) {
      if (!vendor || (v.confidence ?? 0) > (vendor.confidence ?? 0)) vendor = v
    }
  }

  // ── Date: first valid ─────────────────────────────────────────────────────
  const date = allFields.map((f) => f['INVOICE_RECEIPT_DATE']).find((f) => f?.value?.trim()) ?? null

  // ── Invoice number: first valid ───────────────────────────────────────────
  const invoiceNumber = allFields.map((f) => f['INVOICE_RECEIPT_ID']).find((f) => f?.value?.trim()) ?? null

  // ── Currency: first found ─────────────────────────────────────────────────
  const currency = allFields.map((f) => f['CURRENCY']).find((f) => f?.value?.trim()) ?? null

  // ── Tax: highest-confidence ───────────────────────────────────────────────
  let tax: ParsedField | null = null
  for (const f of allFields) {
    const t = f['TAX']
    if (t?.value?.trim()) {
      if (!tax || (t.confidence ?? 0) > (tax.confidence ?? 0)) tax = t
    }
  }

  // ── Total: prefer AMOUNT_DUE; take largest credible positive value ─────────
  // Rationale: for multi-page invoices, each page might show a running subtotal.
  // The overall invoice total is typically the largest non-duplicated value, or
  // the value that appears identically across pages (document-level total).
  const totalCandidates: Array<{ field: ParsedField; amount: number }> = []
  for (const f of allFields) {
    for (const key of ['AMOUNT_DUE', 'TOTAL']) {
      const candidate = f[key]
      if (!candidate?.value) continue
      const amount = parseMoney(candidate.value)
      if (amount && amount > 0) totalCandidates.push({ field: candidate, amount })
    }
  }

  let total: ParsedField | null = null
  if (totalCandidates.length > 0) {
    const uniqueAmounts = [...new Set(totalCandidates.map((c) => c.amount))]
    if (uniqueAmounts.length === 1) {
      // All pages agree — unambiguous
      total = totalCandidates[0].field
    } else {
      // Multiple different values — take the largest and warn the user
      const best = totalCandidates.reduce((a, b) => (a.amount > b.amount ? a : b))
      total = best.field
      warnings.push(
        `Multiple totals found across pages (${uniqueAmounts.join(', ')}). ` +
          `Using the largest value (${best.amount}) — please verify the total.`
      )
    }
  }

  // ── Line items ────────────────────────────────────────────────────────────
  //
  // Rohlik delivery notes: Textract returns one LineItem per visual row, so
  // each weight row ("0.485 kg X CZK219.90/kg CZK106.65") becomes a separate
  // item. Re-processing through rohlikParser consolidates them correctly.
  //
  // All other documents: use the raw Textract LineItems, deduped by description.

  let lineItems: ParsedLineItem[]

  if (isRohlikDoc(vendor, docs)) {
    console.log('[mergeExpenseDocuments] Rohlik delivery note detected — re-parsing via rohlikParser')
    const rawLines = extractRawLines(docs)
    lineItems = parseRohlikLines(rawLines)
  } else {
    const seen = new Set<string>()
    lineItems = []
    for (const doc of docs) {
      for (const item of extractLineItems(doc.LineItemGroups ?? [])) {
        if (!item.description?.trim()) continue
        if (seen.has(item.description)) continue
        seen.add(item.description)
        lineItems.push(item)
      }
    }
  }

  return {
    parsed: { vendor, invoiceNumber, date, total, tax, currency, lineItems },
    warnings,
  }
}
