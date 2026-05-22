import { parseMoney } from './parseMoney'
import type { ParsedResult, ParsedField, ParsedLineItem } from './types'

function field(value: string | null): ParsedField {
  return { value, confidence: null, label: null }
}

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Returns true if the text looks like a Rohlík delivery note.
 * Requires at least 2 matching indicators to avoid false positives.
 */
export function isRohlíkDeliveryNote(text: string): boolean {
  const indicators = [
    /DELIVERY\s+NOTE/i,
    /VELK[AÁ]\s+PECKA/i,
    /Delivered\s+items/i,
    /Total\s+price\s+after\s+discount/i,
    /Courier\s+tip/i,
    /Discount\s+in\s+credits/i,
  ]
  const hits = indicators.filter((re) => re.test(text)).length
  return hits >= 2
}

// ── Field extraction ─────────────────────────────────────────────────────────

function extractDate(text: string): string | null {
  // ISO: 2024-05-15
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
  // Czech: 15. 5. 2024 or 15.5.2024
  const cz = text.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/)
  if (cz) {
    const [, d, m, y] = cz
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

function extractVendor(text: string): string {
  if (/VELK[AÁ]\s+PECKA/i.test(text)) return 'VELKÁ PECKA s.r.o.'
  if (/rohlik|rohlík|rohli\.cz/i.test(text)) return 'Rohlík'
  // Czech company suffixes
  const m = text.match(/^[^\n]*(?:s\.r\.o\.|a\.s\.|spol\.|s\.r\.).*$/im)
  if (m) return m[0].trim().slice(0, 80)
  return 'Rohlík'
}

function extractOrderNumber(text: string): string | null {
  // "Order #12345678" or "Order: 12345678"
  const patterns = [
    /Order\s*[#№:]\s*([A-Z0-9\-/]{4,})/i,
    /Order\s+No\.?\s*:?\s*([A-Z0-9\-/]{4,})/i,
    /(?:objedn[aá]vka|faktura|invoice)\s*[#№:]\s*([A-Z0-9\-/]{4,})/i,
    /[#№]\s*([0-9]{5,})/,
  ]
  for (const re of patterns) {
    const m = re.exec(text)
    if (m) return m[1].trim()
  }
  return null
}

function extractTotal(text: string): string | null {
  // "Total price after discount CZK2,836.31"
  const totalPattern = /Total\s+price\s+after\s+discount\s+(?:CZK|Kč)\s*([\d\s.,]+)/i
  const m = totalPattern.exec(text)
  if (m) {
    const parsed = parseMoney(m[1])
    if (parsed !== null && parsed > 0) return m[1].trim()
  }

  // Czech totals
  const czPatterns = [
    /celkov[aá]\s+(?:cena|castka|suma)[^\n]*?(?:CZK|Kč)\s*([\d\s.,]+)/i,
    /k\s+uhrad[eě][^\n]*?(?:CZK|Kč)\s*([\d\s.,]+)/i,
    /celkem\s+(?:CZK|Kč)\s*([\d\s.,]+)/i,
  ]
  for (const re of czPatterns) {
    const cm = re.exec(text)
    if (cm) {
      const parsed = parseMoney(cm[1])
      if (parsed !== null && parsed > 0) return cm[1].trim()
    }
  }
  return null
}

// ── Line item parsing ────────────────────────────────────────────────────────

// Price line: "2× CZK119.90 CZK239.80" or "1× CZK99.90 CZK99.90"
const PRICE_LINE_RE = /^(\d+(?:[.,]\d+)?)\s*[×xX]\s+(?:CZK|Kč)\s*(-?[\d\s.,]+)\s+(?:CZK|Kč)\s*(-?[\d\s.,]+)$/i

// Single-price line: "Courier tip CZK100.00" or "Discount in credits -CZK3.00"
const SINGLE_PRICE_RE = /^(.+?)\s+(-?(?:CZK|Kč)\s*[\d\s.,]+)$/i

// Lines that are section headers / totals — not individual items
const SKIP_PATTERNS = [
  /^Total\s+price\s+after\s+discount/i,
  /^Subtotal/i,
  /^DELIVERY\s+NOTE/i,
  /^Delivered\s+items/i,
  /^celkem/i,
  /^k\s+uhrad/i,
  /^Page\s+\d/i,
]

function isSkipLine(line: string): boolean {
  return SKIP_PATTERNS.some((re) => re.test(line))
}

/**
 * Parse line items from Rohlík delivery note text.
 *
 * Rohlík uses a two-line format for products:
 *   Line 1: "Air Wick Automatic Spray Refill Scent of winter fruit 250ml"
 *   Line 2: "1× CZK99.90 CZK99.90"
 *
 * And single-line format for fees/adjustments:
 *   "Courier tip CZK100.00"
 *   "Discount in credits -CZK3.00"
 *   "Delivery CZK0.00"
 */
function parseItems(text: string): ParsedLineItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const items: ParsedLineItem[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const nextLine = i + 1 < lines.length ? lines[i + 1] : null

    if (isSkipLine(line)) {
      i++
      continue
    }

    // Try two-line format: current = description, next = price line
    if (nextLine) {
      const priceMatch = PRICE_LINE_RE.exec(nextLine)
      if (priceMatch) {
        const [, qty, unitPriceRaw, amountRaw] = priceMatch
        const amount = parseMoney(amountRaw)
        if (amount !== null) {
          items.push({
            description: line,
            quantity: qty,
            unit_price: unitPriceRaw.trim(),
            amount: String(amount),
            tax_amount: null,
            confidence: 90,
          })
          i += 2
          continue
        }
      }
    }

    // Try single-line format: "Description CZKamount"
    if (!PRICE_LINE_RE.test(line)) {
      const singleMatch = SINGLE_PRICE_RE.exec(line)
      if (singleMatch) {
        const [, desc, amountRaw] = singleMatch
        const amount = parseMoney(amountRaw)
        // Include zero amounts for delivery (CZK0.00), include negatives for discounts
        if (amount !== null && !isSkipLine(desc)) {
          items.push({
            description: desc.trim(),
            quantity: null,
            unit_price: null,
            amount: String(amount),
            tax_amount: null,
            confidence: 75,
          })
        }
      }
    }

    i++
  }

  return items
}

// ── Main export ──────────────────────────────────────────────────────────────

export function parseRohlíkText(text: string, _fileName: string): ParsedResult {
  const vendor = extractVendor(text)
  const date = extractDate(text)
  const orderNumber = extractOrderNumber(text)
  const totalRaw = extractTotal(text)
  const lineItems = parseItems(text)

  return {
    vendor: field(vendor),
    invoiceNumber: field(orderNumber),
    date: field(date),
    total: field(totalRaw),
    tax: field(null),
    currency: field('CZK'),
    lineItems,
  }
}
