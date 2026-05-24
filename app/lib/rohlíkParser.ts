import { parseMoney } from './parseMoney'
import type { ParsedResult, ParsedField, ParsedLineItem } from './types'

function field(value: string | null): ParsedField {
  return { value, confidence: null, label: null }
}

// ── Detection ─────────────────────────────────────────────────────────────────

export function isRohlíkDeliveryNote(text: string): boolean {
  const indicators = [
    /DELIVERY\s+NOTE/i,
    /VELK[AÁ]\s+PECKA/i,
    /Delivered\s+items/i,
    /Total\s+price\s+after\s+discount/i,
    /Courier\s+tip/i,
    /Discount\s+in\s+credits/i,
  ]
  return indicators.filter((re) => re.test(text)).length >= 2
}

// ── Summary field extraction ──────────────────────────────────────────────────

function extractDate(text: string): string | null {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
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
  const m = text.match(/^[^\n]*(?:s\.r\.o\.|a\.s\.|spol\.|s\.r\.).*$/im)
  if (m) return m[0].trim().slice(0, 80)
  return 'Rohlík'
}

function extractOrderNumber(text: string): string | null {
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

/**
 * Full-text fallback total scan. Used only when the state machine does not
 * capture a total from parsed lines. "Customer pays CZK0.00" is intentionally
 * excluded — it is the remaining balance after credits, not the invoice total.
 */
function extractTotal(text: string): string | null {
  const patterns = [
    /Total\s+price\s+after\s+discount\s+(?:CZK|Kč)\s*([\d\s.,]+)/i,
    /Total\s+price\s+to\s+pay\s+(?:CZK|Kč)\s*([\d\s.,]+)/i,
    /Total\s+price\s+(?:CZK|Kč)\s*([\d\s.,]+)/i,
    /celkov[aá]\s+(?:cena|castka|suma)[^\n]*?(?:CZK|Kč)\s*([\d\s.,]+)/i,
    /k\s+uhrad[eě][^\n]*?(?:CZK|Kč)\s*([\d\s.,]+)/i,
    /celkem\s+(?:CZK|Kč)\s*([\d\s.,]+)/i,
  ]
  for (const re of patterns) {
    const m = re.exec(text)
    if (m) {
      const v = parseMoney(m[1])
      if (v !== null && v > 0) return m[1].trim()
    }
  }
  return null
}

// ── State machine regexes (in classification priority order) ──────────────────

// Priority 1 – weight row
// [×xX]? covers all three OCR variants Textract / pdf-parse emit:
//   ×  U+00D7 MULTIPLICATION SIGN (original PDF character)
//   x  lowercase ASCII (some OCR/font mappings)
//   X  uppercase ASCII (most common Textract output for subsequent rows)
// The i flag alone makes x≡X, but we list X explicitly to be unambiguous.
const WEIGHT_ROW_RE =
  /^(\d+[.,]\d+)\s*kg\s*[×xX]?\s*CZK(\d+[.,]\d+)\/kg\s+CZK(\d+[.,]\d+)/i

// Priority 2 – standard qty×price line
// \s* before [×xX] handles "6 × CZK..." (space before multiplier from Textract)
const STANDARD_PRICE_RE = /^(\d+)\s*[×xX]\s*CZK(\d+[.,]\d+)\s+CZK(\d+[.,]\d+)/i

// Priority 3 – payment section fee lines
const DELIVERY_RE = /^delivery\s+CZK(-?[\d.,]+)/i
const COURIER_TIP_RE = /^courier tip\s+CZK(-?[\d.,]+)/i
const DISCOUNT_CREDITS_RE = /^discount in credits\s+-?CZK([\d.,]+)/i
const TOTAL_AFTER_DISCOUNT_RE = /^total price after discount\s+CZK([\d.,]+)/i
const TOTAL_TO_PAY_RE = /^total price to pay\s+CZK([\d.,]+)/i

// Document header lines to skip in any state
const SKIP_ALWAYS_RES = [
  /^DELIVERY\s+NOTE/i,
  /^Delivered\s+items/i,
  /^Page\s+\d/i,
  /^VELK[AÁ]\s+PECKA/i,
]

// ── Data types ────────────────────────────────────────────────────────────────

interface WeightRow {
  kg: number
  pricePerKg: number
  lineTotal: number
}

interface StandardRow {
  qty: number
  unitPrice: number
  lineTotal: number
}

interface CurrentProduct {
  description: string
  weightRows: WeightRow[]
  standardRow: StandardRow | null
}

type State = 'ITEMS' | 'PAYMENT' | 'DONE'

interface ParseItemsResult {
  items: ParsedLineItem[]
  total: string | null
  warnings: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtQty(n: number): string {
  return n.toFixed(3).replace(/\.?0+$/, '')
}

function finalizeProduct(product: CurrentProduct, debug: boolean): ParsedLineItem | null {
  const { description, weightRows, standardRow } = product
  if (!description) return null

  if (weightRows.length > 0) {
    const qty = weightRows.reduce((s, r) => s + r.kg, 0)
    const amount = Math.round(weightRows.reduce((s, r) => s + r.lineTotal, 0) * 100) / 100
    const prices = [...new Set(weightRows.map((r) => r.pricePerKg))]
    return {
      description,
      quantity: fmtQty(qty),
      unit_price: prices.length === 1 ? String(prices[0]) : null,
      amount: String(amount),
      tax_amount: null,
      confidence: 90,
    }
  }

  if (standardRow) {
    return {
      description,
      quantity: String(standardRow.qty),
      unit_price: String(standardRow.unitPrice),
      amount: String(standardRow.lineTotal),
      tax_amount: null,
      confidence: 90,
    }
  }

  return null // description with no pricing data — not a standalone item
}

function makeFeeItem(description: string, amount: number): ParsedLineItem {
  return {
    description,
    quantity: null,
    unit_price: null,
    amount: String(amount),
    tax_amount: null,
    confidence: 75,
  }
}

// ── State machine ─────────────────────────────────────────────────────────────

function parseItems(text: string, debug: boolean): ParseItemsResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const items: ParsedLineItem[] = []
  const warnings: string[] = []
  let state: State = 'ITEMS'
  let currentProduct: CurrentProduct | null = null
  let total: string | null = null

  // State machine rules — enforced in the loop below:
  // Rule 1: weightRow → attach to currentProduct.weightRows; do NOT finalize, do NOT clear currentProduct
  // Rule 2: standardPriceLine → attach to currentProduct.standardRow, then finalize and clear currentProduct
  // Rule 3: new productName line → finalize currentProduct if open, then set currentProduct = new product
  // Rule 4: "Transport and payment" → finalize currentProduct if open, switch state to PAYMENT
  // Rule 5: end of lines → finalize currentProduct if still open

  function classify(classification: string) {
    if (debug) console.log(`[rohlikParser]   → classified as: ${classification}`)
  }

  function flush() {
    if (!currentProduct) return
    const item = finalizeProduct(currentProduct, debug)
    if (item) {
      if (debug) {
        console.log(
          `[rohlikParser] FINALIZED: "${item.description}" qty=${item.quantity} amount=${item.amount} weightRows=${currentProduct.weightRows.length}`
        )
      }
      items.push(item)
    }
    currentProduct = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (debug) {
      console.log(`[rohlikParser] line ${i}: "${line.substring(0, 60)}"`)
      console.log(`[rohlikParser]   → currentProduct: ${currentProduct?.description ?? 'null'}`)
    }

    // DONE: stop all processing
    if (state === 'DONE') {
      classify('done_skip')
      continue
    }

    // ── State transitions ──────────────────────────────────────────────────

    if (/^transport and payment/i.test(line)) {
      // Rule 4: finalize open product, then enter PAYMENT state
      classify('skip_transition')
      flush()
      state = 'PAYMENT'
      if (debug) console.log('[rohlikParser] state→PAYMENT')
      continue
    }

    if (state === 'PAYMENT' && /^customer pays/i.test(line)) {
      classify('skip_done')
      state = 'DONE'
      continue
    }

    // ── Always-skip document headers ───────────────────────────────────────

    if (SKIP_ALWAYS_RES.some((re) => re.test(line))) {
      classify('skip_always')
      continue
    }

    // ── Priority 1: weight row ─────────────────────────────────────────────
    // Rule 1: attach to currentProduct.weightRows — never finalize here

    const weightMatch = WEIGHT_ROW_RE.exec(line)
    if (weightMatch) {
      const kg = parseMoney(weightMatch[1])
      const pricePerKg = parseMoney(weightMatch[2])
      const lineTotal = parseMoney(weightMatch[3])
      if (kg !== null && pricePerKg !== null && lineTotal !== null) {
        if (currentProduct) {
          classify('weight_row')
          if (debug) {
            console.log(`[rohlikParser]   → attaches_to: "${currentProduct.description}"`)
          }
          currentProduct.weightRows.push({ kg, pricePerKg, lineTotal })
        } else {
          classify('weight_row_orphan')
          const warn = `Orphan weight row at line ${i}: "${line.slice(0, 50)}"`
          warnings.push(warn)
        }
      } else {
        classify('weight_row_parse_failed')
        warnings.push(`Failed to parse weight row at line ${i}: "${line.slice(0, 50)}"`)
      }
      continue
    }

    // ── Priority 2: standard price line ───────────────────────────────────
    // Rule 2: finalize the current product block

    const priceMatch = STANDARD_PRICE_RE.exec(line)
    if (priceMatch) {
      classify('standard_price_line')
      const qty = parseInt(priceMatch[1], 10)
      const unitPrice = parseMoney(priceMatch[2])
      const lineTotal = parseMoney(priceMatch[3])
      if (unitPrice !== null && lineTotal !== null) {
        if (currentProduct) {
          currentProduct.standardRow = { qty, unitPrice, lineTotal }
          flush() // Rule 2: finalize after attaching standard row
        } else {
          warnings.push(`Orphan price line at line ${i}: "${line.slice(0, 50)}"`)
          if (debug) console.log(`[rohlikParser]   → orphan (no current product)`)
        }
      }
      continue
    }

    // ── Priority 3: payment fees (PAYMENT state only) ──────────────────────

    if (state === 'PAYMENT') {
      const deliveryMatch = DELIVERY_RE.exec(line)
      if (deliveryMatch) {
        classify('payment_fee_delivery')
        const amount = parseMoney(deliveryMatch[1])
        if (amount !== null) items.push(makeFeeItem('Delivery', amount))
        continue
      }

      const courierMatch = COURIER_TIP_RE.exec(line)
      if (courierMatch) {
        classify('payment_fee_courier')
        const amount = parseMoney(courierMatch[1])
        if (amount !== null) items.push(makeFeeItem('Courier tip', amount))
        continue
      }

      const discountMatch = DISCOUNT_CREDITS_RE.exec(line)
      if (discountMatch) {
        classify('payment_fee_discount')
        const amount = parseMoney(discountMatch[1])
        if (amount !== null) items.push(makeFeeItem('Discount in credits', -amount))
        continue
      }

      const totalAfterDiscountMatch = TOTAL_AFTER_DISCOUNT_RE.exec(line)
      if (totalAfterDiscountMatch) {
        classify('total_after_discount')
        const amount = parseMoney(totalAfterDiscountMatch[1])
        if (amount !== null && total === null) {
          total = String(amount)
          if (debug) {
            console.log(`[rohlikParser] total=${total} source="Total price after discount"`)
          }
        }
        continue
      }

      const totalToPayMatch = TOTAL_TO_PAY_RE.exec(line)
      if (totalToPayMatch) {
        classify('total_to_pay')
        const amount = parseMoney(totalToPayMatch[1])
        if (amount !== null && total === null) {
          total = String(amount)
          if (debug) {
            console.log(`[rohlikParser] total=${total} source="Total price to pay"`)
          }
        }
        continue
      }

      classify('payment_skip')
      continue
    }

    // ── Priority 4: skip lines (ITEMS state) ──────────────────────────────

    if (
      /^payment method/i.test(line) ||
      /^customer\s*:/i.test(line) ||
      /^supplier\s*:/i.test(line) ||
      /^deliver\s+to\s*:/i.test(line) ||
      /^company\s+reg/i.test(line) ||
      /^vat\s+id/i.test(line) ||
      /^bank\s+connection/i.test(line) ||
      /^bio\s+cert/i.test(line) ||
      /^spisov[aá]\s+zna/i.test(line)
    ) {
      classify('skip_line')
      continue
    }

    // ── Priority 4b: in-items fee lines ───────────────────────────────────
    // "Return packages" appears in the items section, before Transport and payment.

    const returnPkgMatch = /^return packages.*CZK(-?[\d.,]+)/i.exec(line)
    if (returnPkgMatch) {
      classify('return_packages_fee')
      flush()
      const amount = parseMoney(returnPkgMatch[1])
      if (amount !== null) items.push(makeFeeItem('Return packages', amount))
      continue
    }

    // ── Priority 5: product name ───────────────────────────────────────────
    // Rule 3: finalize the previous product, start a new one

    classify('product_name')
    flush() // Rule 3: finalize open block before starting new one
    currentProduct = { description: line, weightRows: [], standardRow: null }
  }

  flush() // Rule 5: finalize whatever is open at end of input

  return { items, total, warnings }
}

// ── Textract line-array entry point ──────────────────────────────────────────
//
// Called by mergeExpenseDocuments for the async Textract path on Rohlik docs.
//
// Textract treats each visual row as a separate LineItem. Weight rows like
// "0.485 kg X CZK219.90/kg CZK106.65" arrive as independent ITEM strings that
// must be consolidated back under their product. The text-path state machine
// (parseItems) cannot be reused here because the lines arrive in a different
// structural context: no "Transport and payment" header, possible interleaving
// of orphan continuation lines, and \n-embedded price data.
//
// This function implements a type-guarded state machine:
//   'pending'  — product name received, waiting to see whether the next line
//                is a weight row or a standard price line
//   'weight'   — at least one weight row received; only more weight rows allowed
//   'standard' — standard price line received and product finalized immediately
//
// A 'pending' product that never receives a price line is discarded. This
// handles Textract continuation lines (description split across multiple
// LineItems) and section headers that slip through as ITEM text.

export function parseRohlikLines(lines: string[]): ParsedLineItem[] {
  type ProductType = 'pending' | 'weight' | 'standard'

  interface WeightRowEntry {
    kg: number
    pricePerKg: number
    lineTotal: number
  }

  interface RohlikProduct {
    description: string
    type: ProductType
    weightRows: WeightRowEntry[]
    standardRow: { qty: number; unitPrice: number; lineTotal: number } | null
  }

  const items: ParsedLineItem[] = []
  let current: RohlikProduct | null = null
  let mode: 'ITEMS' | 'PAYMENT' = 'ITEMS'

  function finalizeCurrent() {
    if (!current) return
    if (current.type === 'weight' && current.weightRows.length > 0) {
      const qty = current.weightRows.reduce((s, r) => s + r.kg, 0)
      const amount =
        Math.round(current.weightRows.reduce((s, r) => s + r.lineTotal, 0) * 100) / 100
      const prices = [...new Set(current.weightRows.map((r) => r.pricePerKg))]
      items.push({
        description: current.description,
        quantity: qty.toFixed(3).replace(/\.?0+$/, ''),
        unit_price: prices.length === 1 ? String(prices[0]) : null,
        amount: String(amount),
        tax_amount: null,
        confidence: 90,
      })
    } else if (current.type === 'standard' && current.standardRow) {
      items.push({
        description: current.description,
        quantity: String(current.standardRow.qty),
        unit_price: String(current.standardRow.unitPrice),
        amount: String(current.standardRow.lineTotal),
        tax_amount: null,
        confidence: 90,
      })
    }
    // 'pending' (no price line followed) → discard silently
    current = null
  }

  function makeFee(description: string, amount: number): ParsedLineItem {
    return { description, quantity: null, unit_price: null, amount: String(amount), tax_amount: null, confidence: 75 }
  }

  // Lines that must never become product names in ITEMS mode
  function isSkip(line: string): boolean {
    return (
      /^payment method/i.test(line) ||
      /^customer pays/i.test(line) ||
      /^customer\s*:/i.test(line) ||
      /^supplier\s*:/i.test(line) ||
      /^deliver\s+to\s*:/i.test(line) ||
      /^company\s+reg/i.test(line) ||
      /^vat\s+id/i.test(line) ||
      /^bank\s+connection/i.test(line) ||
      /^bio\s+cert/i.test(line) ||
      /^spisov[aá]/i.test(line) ||
      /^delivery\s+CZK/i.test(line) ||
      /^courier tip/i.test(line) ||
      /^discount in credits/i.test(line) ||
      /^total price/i.test(line)
    )
  }

  for (const rawLine of lines) {
    // Split on first embedded \n: Textract appends the price line to the
    // product name string when they occupy the same bounding box.
    let line = rawLine
    let embedded: string | null = null
    const nIdx = rawLine.indexOf('\n')
    if (nIdx !== -1) {
      line = rawLine.substring(0, nIdx).trim()
      embedded = rawLine.substring(nIdx + 1).trim()
    }

    if (!line) continue

    // ── PAYMENT mode ──────────────────────────────────────────────────────
    if (mode === 'PAYMENT') {
      const dm = DELIVERY_RE.exec(line)
      if (dm) { const a = parseMoney(dm[1]); if (a !== null) items.push(makeFee('Delivery', a)); continue }
      const cm = COURIER_TIP_RE.exec(line)
      if (cm) { const a = parseMoney(cm[1]); if (a !== null) items.push(makeFee('Courier tip', a)); continue }
      const dcm = DISCOUNT_CREDITS_RE.exec(line)
      if (dcm) { const a = parseMoney(dcm[1]); if (a !== null) items.push(makeFee('Discount in credits', -a)); continue }
      // Total price / Customer pays / everything else → skip
      continue
    }

    // ── ITEMS mode ────────────────────────────────────────────────────────

    // TYPE 3 — section header: enter PAYMENT mode
    if (/^transport and payment/i.test(line)) {
      finalizeCurrent()
      mode = 'PAYMENT'
      continue
    }

    // TYPE 4 — skip line
    if (isSkip(line)) continue

    // TYPE 1 — weight row
    const wm = WEIGHT_ROW_RE.exec(line)
    if (wm) {
      const kg = parseMoney(wm[1])
      const pricePerKg = parseMoney(wm[2])
      const lineTotal = parseMoney(wm[3])
      if (kg !== null && pricePerKg !== null && lineTotal !== null) {
        if (current && (current.type === 'pending' || current.type === 'weight')) {
          current.type = 'weight'
          current.weightRows.push({ kg, pricePerKg, lineTotal })
        }
        // else: orphan weight row (no product open, or wrong type) → skip
      }
      continue
    }

    // TYPE 2 — standard price line
    const pm = STANDARD_PRICE_RE.exec(line)
    if (pm) {
      const qty = parseInt(pm[1], 10)
      const unitPrice = parseMoney(pm[2])
      const lineTotal = parseMoney(pm[3])
      if (unitPrice !== null && lineTotal !== null) {
        if (current && (current.type === 'pending' || current.type === 'standard')) {
          current.type = 'standard'
          current.standardRow = { qty, unitPrice, lineTotal }
          finalizeCurrent()
        }
        // else: orphan price line or wrong type → skip
      }
      continue
    }

    // TYPE 2.5 — return packages deposit fee (appears in ITEMS section)
    const rpm = /^return packages.*CZK(-?[\d.,]+)/i.exec(line)
    if (rpm) {
      finalizeCurrent()
      const amount = parseMoney(rpm[1])
      if (amount !== null) items.push(makeFee('Return packages', amount))
      continue
    }

    // TYPE 5 — product name (everything else)
    finalizeCurrent()

    // Handle embedded price line (split from \n above)
    if (embedded) {
      const epm = STANDARD_PRICE_RE.exec(embedded)
      if (epm) {
        const qty = parseInt(epm[1], 10)
        const unitPrice = parseMoney(epm[2])
        const lineTotal = parseMoney(epm[3])
        if (unitPrice !== null && lineTotal !== null) {
          items.push({
            description: line,
            quantity: String(qty),
            unit_price: String(unitPrice),
            amount: String(lineTotal),
            tax_amount: null,
            confidence: 90,
          })
          current = null
          continue
        }
      }
      // embedded part isn't a price line — fall through, use line as product name only
    }

    current = { description: line, type: 'pending', weightRows: [], standardRow: null }
  }

  finalizeCurrent()
  return items
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseRohlíkText(text: string, _fileName: string): ParsedResult {
  const debug = process.env.NODE_ENV === 'development'
  if (debug) {
    console.log('[rohlikParser] starting parse, text length:', text.length)
  }

  const { items: lineItems, total: smTotal, warnings } = parseItems(text, debug)

  if (debug) {
    for (const w of warnings) console.warn('[rohlikParser] warning:', w)
    console.log('[rohlikParser] parsed items:', lineItems.length)
    for (const item of lineItems) {
      console.log(
        `[rohlikParser]   - "${item.description}" qty=${item.quantity ?? '—'} amt=${item.amount}`
      )
    }
  }

  // State-machine total takes priority; fall back to full-text scan
  const totalRaw = smTotal ?? extractTotal(text)

  return {
    vendor: field(extractVendor(text)),
    invoiceNumber: field(extractOrderNumber(text)),
    date: field(extractDate(text)),
    total: field(totalRaw),
    tax: field(null),
    currency: field('CZK'),
    lineItems,
  }
}
