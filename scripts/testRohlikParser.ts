/**
 * Manual test fixture for the Rohlík delivery note parser.
 *
 * Run with:
 *   npx tsx scripts/testRohlikParser.ts
 *
 * Tests:
 * - Multi-weight chicken items are merged into one item
 * - Orphan weight rows produce no standalone item
 * - Delivery / Courier tip / Discount are parsed as fee items
 * - Customer pays CZK0.00 does NOT become an item
 * - Customer/Supplier footer lines do NOT become items
 */

import { parseRohlíkText, isRohlíkDeliveryNote } from '../app/lib/rohlíkParser'
import { parseMoney } from '../app/lib/parseMoney'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(process.env as any).NODE_ENV = 'development'  // enable debug logging in parser

const FIXTURE = `
DELIVERY NOTE
VELKÁ PECKA s.r.o.
Order #1124981236

Delivered items

Chicken breast fillets
0.595 kg x CZK219.90/kg CZK130.84
0.485 kg x CZK219.90/kg CZK106.65

Some other meat product
0.413 kg x CZK219.90/kg CZK90.82
0.47 kg x CZK219.90/kg CZK105.11

Air Wick Automatic Spray Refill Scent of winter fruit 250ml
1× CZK99.90 CZK99.90

Bordeaux AOC GVG red wine 0.75l
2× CZK119.90 CZK239.80

Transport and payment
Delivery CZK0.00
Courier tip CZK20.00
Discount in credits -CZK6.00
Total price after discount CZK2,146.89
Payment method By card
Customer pays CZK0.00

Customer:
  John Doe
  Some Street 1, Praha

Supplier:
  VELKÁ PECKA s.r.o.
  Company Reg. No.: 123456
  VAT ID: CZ123456
`

// ── Run parser ────────────────────────────────────────────────────────────────

console.log('\n=== isRohlíkDeliveryNote ===')
const isNote = isRohlíkDeliveryNote(FIXTURE)
console.log('detected:', isNote)
assert(isNote, 'Should detect as Rohlík delivery note')

const result = parseRohlíkText(FIXTURE, 'test.pdf')

console.log('\n=== Summary fields ===')
console.log('vendor:', result.vendor?.value)
console.log('invoiceNumber:', result.invoiceNumber?.value)
console.log('date:', result.date?.value)
console.log('total:', result.total?.value, '→', parseMoney(result.total?.value ?? null))

console.log('\n=== Line items ===')
for (const item of result.lineItems) {
  console.log(
    `  desc="${item.description}" qty=${item.quantity ?? '—'} unit=${item.unit_price ?? '—'} amount=${item.amount}`
  )
}

// ── Assertions ────────────────────────────────────────────────────────────────

const items = result.lineItems
const descs = items.map((i) => i.description ?? '')

console.log('\n=== Assertions ===')

// 1. No item.description should start with a weight pattern
const WEIGHT_DESC_RE = /^\d+[.,]\d+\s*kg\b/i
const badItems = descs.filter((d) => WEIGHT_DESC_RE.test(d))
assert(
  badItems.length === 0,
  `Weight rows must not become items. Bad: ${JSON.stringify(badItems)}`
)

// 2. Chicken breast fillets appears exactly once
const chickenItems = items.filter((i) => /chicken breast/i.test(i.description ?? ''))
assert(chickenItems.length === 1, `Expected 1 chicken item, got ${chickenItems.length}`)
const chicken = chickenItems[0]
assert(
  Math.abs((parseMoney(chicken.quantity) ?? 0) - 1.08) < 0.01,
  `Chicken qty should be ~1.08, got ${chicken.quantity}`
)
assert(
  Math.abs((parseMoney(chicken.amount) ?? 0) - 237.49) < 0.01,
  `Chicken amount should be ~237.49, got ${chicken.amount}`
)
console.log('✓ Chicken breast fillets: one item, qty=', chicken.quantity, 'amount=', chicken.amount)

// 3. "Some other meat product" appears once (both weight rows merged)
const otherMeat = items.filter((i) => /other meat/i.test(i.description ?? ''))
assert(otherMeat.length === 1, `Expected 1 "other meat" item, got ${otherMeat.length}`)
console.log('✓ Other meat product: one item, amount=', otherMeat[0].amount)

// 4. Delivery exists
const delivery = items.find((i) => /^delivery$/i.test(i.description ?? ''))
assert(delivery !== undefined, 'Delivery item must exist')
assert(parseMoney(delivery!.amount) === 0, `Delivery amount should be 0, got ${delivery!.amount}`)
console.log('✓ Delivery item found, amount=', delivery!.amount)

// 5. Courier tip exists
const tip = items.find((i) => /courier tip/i.test(i.description ?? ''))
assert(tip !== undefined, 'Courier tip item must exist')
assert(parseMoney(tip!.amount) === 20, `Courier tip should be 20, got ${tip!.amount}`)
console.log('✓ Courier tip found, amount=', tip!.amount)

// 6. Discount in credits exists as negative
const discount = items.find((i) => /discount in credits/i.test(i.description ?? ''))
assert(discount !== undefined, 'Discount in credits item must exist')
assert((parseMoney(discount!.amount) ?? 0) < 0, `Discount should be negative, got ${discount!.amount}`)
console.log('✓ Discount in credits found, amount=', discount!.amount)

// 7. Customer pays does NOT appear as item
const customerPays = items.find((i) => /customer pays/i.test(i.description ?? ''))
assert(customerPays === undefined, 'Customer pays must NOT be an item')
console.log('✓ Customer pays not in items')

// 8. Customer / Supplier footer lines not in items
const footerItems = items.filter((i) =>
  /^Customer\s*:?$|^Supplier\s*:?$|Company Reg|VAT ID/i.test(i.description ?? '')
)
assert(footerItems.length === 0, `Footer lines must not become items: ${JSON.stringify(footerItems.map(i => i.description))}`)
console.log('✓ No footer lines in items')

// 9. Total is extracted from "Total price after discount", not "Customer pays"
const total = parseMoney(result.total?.value ?? null)
assert(total !== null && total > 0, `Total should be > 0, got ${total}`)
assert(
  Math.abs((total ?? 0) - 2146.89) < 0.01,
  `Total should be ~2146.89, got ${total}`
)
console.log('✓ Invoice total:', total)

console.log('\n✅ All assertions passed.')

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('❌ FAIL:', message)
    process.exit(1)
  }
}
