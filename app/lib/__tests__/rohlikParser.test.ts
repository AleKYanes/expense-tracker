import { describe, it, expect } from 'vitest'
import { parseRohlíkText, parseRohlikLines } from '../rohlíkParser'

// Verbatim lines from a real Rohlik delivery note receipt, in the exact format
// pdf-parse emits: the PDF glues the price-per-kg to the line total on weight
// rows ("…/kgCZK106.65") and glues label to amount on fee/total lines
// ("DeliveryCZK0.00", "…discountCZK2,146.89"). Do NOT add spaces before CZK —
// they do not exist in the source PDF, and hand-inserting them here masked a
// bug where every item was silently dropped. See the golden fixture below.
const FIXTURE = [
  'Chicken breast fillets',
  '0.595 kg × CZK219.90/kgCZK130.84',
  '0.485 kg × CZK219.90/kgCZK106.65',
  '0.413 kg × CZK219.90/kgCZK90.82',
  '0.478 kg × CZK219.90/kgCZK105.11',
  'MASO! Beef minced',
  '0.613 kg × CZK299.90/kgCZK183.84',
  '0.611 kg × CZK299.90/kgCZK183.24',
  'Transport and payment',
  'DeliveryCZK0.00',
  'Courier tipCZK20.00',
  'Discount in credits-CZK6.00',
  'Total price after discountCZK2,146.89',
  'Payment methodBy card',
  'Customer pays CZK0.00',
].join('\n')

describe('parseRohlíkText – fixture', () => {
  const result = parseRohlíkText(FIXTURE)

  it('parses Chicken breast fillets as a weighted item', () => {
    const item = result.lineItems.find((i) => i.description === 'Chicken breast fillets')
    expect(item).toBeDefined()
    // 0.595 + 0.485 + 0.413 + 0.478 = 1.971
    expect(Number(item!.quantity)).toBeCloseTo(1.971, 2)
    // 130.84 + 106.65 + 90.82 + 105.11 = 433.42
    expect(Number(item!.amount)).toBeCloseTo(433.42, 2)
  })

  it('parses MASO! Beef minced as a weighted item', () => {
    const item = result.lineItems.find((i) => i.description === 'MASO! Beef minced')
    expect(item).toBeDefined()
    // 0.613 + 0.611 = 1.224
    expect(Number(item!.quantity)).toBeCloseTo(1.224, 2)
    // 183.84 + 183.24 = 367.08
    expect(Number(item!.amount)).toBeCloseTo(367.08, 2)
  })

  it('parses Delivery fee', () => {
    const item = result.lineItems.find((i) => i.description === 'Delivery')
    expect(item).toBeDefined()
    expect(Number(item!.amount)).toBe(0)
  })

  it('parses Courier tip fee', () => {
    const item = result.lineItems.find((i) => i.description === 'Courier tip')
    expect(item).toBeDefined()
    expect(Number(item!.amount)).toBe(20)
  })

  it('parses Discount in credits as a negative amount', () => {
    const item = result.lineItems.find((i) => i.description === 'Discount in credits')
    expect(item).toBeDefined()
    expect(Number(item!.amount)).toBe(-6)
  })

  it('captures invoice total from "Total price after discount"', () => {
    expect(Number(result.total?.value)).toBeCloseTo(2146.89, 2)
  })

  it('does not use "Customer pays CZK0.00" as the invoice total', () => {
    // Customer pays is the remaining balance after credits, not the order total
    expect(Number(result.total?.value)).not.toBe(0)
  })
})

// Full receipt fixture for parseRohlikLines.
//
// Lines are in the format Textract's AnalyzeExpense produces:
//   - Standard items: product name + price line joined by \n in the ITEM field
//   - Weight items: product name is the first LineItem; subsequent weight rows
//     arrive as separate LineItems with the raw row text as the ITEM field
//   - Textract sometimes splits long descriptions across LineItems; the
//     continuation appears as a separate ITEM string
//   - Payment section lines appear as EXPENSE_ROW text including CZK amounts
//
// Price lines use the no-space format the underlying PDF glyphs produce
// ("…CZK53.91CZK107.82", "…/kgCZK130.84", "DeliveryCZK0.00"). The parser's
// regexes tolerate zero-or-more whitespace before CZK, so this also covers the
// space-separated form should Textract ever insert one.
const FULL_RECEIPT_LINES = [
  // Standard items — price line embedded after \n
  'Dacello Turkey ham sliced 150g\n2× CZK53.91CZK107.82',
  'Kitchin White Cannellini beans in tomato 4×200g\n3× CZK14.31CZK42.93',
  'Kitchin Rice Basmati 500g\n1× CZK26.91CZK26.91',
  'Kotányi Chilli mill 7g\n1× CZK87.90CZK87.90',
  // Weight items — product name then one row per weight entry
  'Chicken breast fillets',
  '0.595 kg × CZK219.90/kgCZK130.84',  // × U+00D7
  '0.485 kg X CZK219.90/kgCZK106.65',  // X uppercase ASCII (Textract OCR variant)
  '0.413 kg X CZK219.90/kgCZK90.82',
  '0.478 kg X CZK219.90/kgCZK105.11',
  // More standard items
  'Leros Deep sleep 20g\n1× CZK73.90CZK73.90',
  'Listerine Total Care 250ml\n1× CZK174.90CZK174.90',
  'M&S Food Chilli Con Carne 300g\n1× CZK89.90CZK89.90',
  // Second weight product
  'MASO! Beef minced',
  '0.613 kg × CZK299.90/kgCZK183.84',
  '0.611 kg X CZK299.90/kgCZK183.24',
  // Embedded price lines
  'Miil High protein curd dessert vanilla, pouch 125g\n6x CZK17.91CZK107.46',
  'Miil Mozzarella 125g\n2× CZK20.61CZK41.22',
  // Textract split this long description — first part has the price embedded,
  // second part ("retractable tape 15pcs") is an orphan continuation line
  'Moddia Garbage bags 35l with lime scent and retractable tape 15pcs\n1× CZK17.91CZK17.91',
  'retractable tape 15pcs',              // continuation — must be discarded
  'Moddia Garbage bags 60l with easy tie 10pcs\n1× CZK22.41CZK22.41',
  // Standard item immediately after orphan — must NOT absorb previous weight rows
  'Cool eggs size L 6pcs\n4× CZK45.90CZK183.60',
  'Roman salad 1pc 280g\n1× CZK29.90CZK29.90',
  'Santa Maria 230g\n1× CZK88.90CZK88.90',
  'Santa Maria Tex Mex Fajita Seasoning Mix 230g\n2× CZK51.90CZK103.80',
  'Yutto Peanutbutter Smooth 100% 350g\n1× CZK46.71CZK46.71',
  'Yutto Roasted unsalted cashews 175g\n1× CZK44.91CZK44.91',
  'Yutto Sunflower seeds shelled 500g\n1× CZK41.31CZK41.31',
  // Payment section
  'Transport and payment',
  'DeliveryCZK0.00',
  'Courier tipCZK20.00',
  'Discount in credits-CZK6.00',
  'Total price after discountCZK2,146.89',
  'Customer pays CZK0.00',
]

describe('parseRohlikLines – full receipt fixture', () => {
  const items = parseRohlikLines(FULL_RECEIPT_LINES)

  it('consolidates all four Chicken breast weight rows (× and X variants)', () => {
    const item = items.find((i) => i.description === 'Chicken breast fillets')
    expect(item).toBeDefined()
    // 0.595 + 0.485 + 0.413 + 0.478 = 1.971
    expect(Number(item!.quantity)).toBeCloseTo(1.971, 2)
    // 130.84 + 106.65 + 90.82 + 105.11 = 433.42
    expect(Number(item!.amount)).toBeCloseTo(433.42, 2)
  })

  it('consolidates both MASO! Beef minced weight rows', () => {
    const item = items.find((i) => i.description === 'MASO! Beef minced')
    expect(item).toBeDefined()
    // 0.613 + 0.611 = 1.224
    expect(Number(item!.quantity)).toBeCloseTo(1.224, 2)
    // 183.84 + 183.24 = 367.08
    expect(Number(item!.amount)).toBeCloseTo(367.08, 2)
  })

  it('parses embedded price for Miil High protein (qty=6, amount=107.46)', () => {
    const item = items.find(
      (i) => i.description === 'Miil High protein curd dessert vanilla, pouch 125g'
    )
    expect(item).toBeDefined()
    expect(Number(item!.quantity)).toBe(6)
    expect(Number(item!.amount)).toBeCloseTo(107.46, 2)
  })

  it('parses embedded price for Moddia Garbage bags 35l (qty=1, amount=17.91)', () => {
    const item = items.find((i) =>
      i.description?.startsWith('Moddia Garbage bags 35l')
    )
    expect(item).toBeDefined()
    expect(Number(item!.quantity)).toBe(1)
    expect(Number(item!.amount)).toBeCloseTo(17.91, 2)
  })

  it('discards orphan continuation line "retractable tape 15pcs"', () => {
    const orphan = items.find((i) => i.description === 'retractable tape 15pcs')
    expect(orphan).toBeUndefined()
  })

  it('parses Yutto Sunflower seeds as standard item (qty=1, amount=41.31)', () => {
    const item = items.find((i) => i.description === 'Yutto Sunflower seeds shelled 500g')
    expect(item).toBeDefined()
    expect(Number(item!.quantity)).toBe(1)
    expect(Number(item!.amount)).toBeCloseTo(41.31, 2)
  })

  it('parses Cool eggs (qty=4, amount=183.60)', () => {
    const item = items.find((i) => i.description === 'Cool eggs size L 6pcs')
    expect(item).toBeDefined()
    expect(Number(item!.quantity)).toBe(4)
    expect(Number(item!.amount)).toBeCloseTo(183.6, 2)
  })

  it('does not produce orphan weight-row items', () => {
    const orphans = items.filter((i) =>
      /^\d+[.,]\d+\s*kg\s*[×xX]?\s*CZK/i.test(i.description ?? '')
    )
    expect(orphans).toHaveLength(0)
  })

  it('emits Delivery fee (amount=0)', () => {
    const item = items.find((i) => i.description === 'Delivery')
    expect(item).toBeDefined()
    expect(Number(item!.amount)).toBe(0)
  })

  it('emits Courier tip (amount=20)', () => {
    const item = items.find((i) => i.description === 'Courier tip')
    expect(item).toBeDefined()
    expect(Number(item!.amount)).toBe(20)
  })

  it('emits Discount in credits as negative (amount=-6)', () => {
    const item = items.find((i) => i.description === 'Discount in credits')
    expect(item).toBeDefined()
    expect(Number(item!.amount)).toBe(-6)
  })

  it('does not emit Customer pays as an item', () => {
    const bad = items.find((i) => /customer pays/i.test(i.description ?? ''))
    expect(bad).toBeUndefined()
  })
})

// ── Golden fixture ────────────────────────────────────────────────────────────
//
// The complete, verbatim pdf-parse output of a real Rohlik delivery note
// (order #1124981236). This is the exact text the /api/test-textract route
// feeds to parseRohlíkText — no hand-editing, no inserted spaces. It exercises
// the three real-world layout quirks that previously broke parsing:
//   1. "qty× CZKunitCZKtotal" — the two prices are glued with no separator
//   2. "1× CZK31.41" / "CZK31.41" — a price row wrapped onto two lines
//   3. wrapped product names, e.g. "Air Wick … winter fruit" / "250ml"
// Before the fix this produced 0 items and a null total.
const GOLDEN_RECEIPT = `

* * * * * * * * * * * * * * * * * * * * * * * * * * * * *
DELIVERY NOTE
Order #1124981236
* * * * * * * * * * * * * * * * * * * * * * * * * * * * *
Delivered items
Air Wick Automatic Spray Refill Scent of winter fruit
250ml
1× CZK99.90CZK99.90
Alterra Lip Oil 02 1pcs
1× CZK69.90CZK69.90
Bordeaux AOC GVG red wine 0.75l
2× CZK119.90CZK239.80
Sweet Moments Chardonnay 0. 75 l 0.75l
1× CZK89.90CZK89.90
Sweet Moments Muscat 0.75l
1× CZK89.90CZK89.90
Every. Naked Taco (frozen) 450g
1× CZK168.24CZK168.24
Heinz Zero Ketchup 425g
1× CZK59.90CZK59.90
Hellmann's Cheddar sauce 250ml
1× CZK77.40CZK77.40
Chateau Valtice Zweigeltrebe rosé 0.75l
2× CZK99.90CZK199.80
Isana Cotton buds 160pcs
1× CZK17.90CZK17.90
Kazayak Reserva Cabernet Sauvignon 0.75l
2× CZK89.90CZK179.80
Marks & Spencer Sweet soy sauce 150ml
1× CZK80.90CZK80.90
Marks & Spencer Tagliatelle Egg Pasta 500g
1× CZK100.90CZK100.90
Miil High protein curd dessert vanilla, pouch 125g
4× CZK17.91CZK71.64
Miil Mozzarella light 125g
2× CZK20.61CZK41.22
Miil Cheese threads smoked 100g
1× CZK31.41
CZK31.41
Bakery Brod Veka sliced fat packaged 360g
1× CZK31.90CZK31.90
Rexona Maximum Protection Antiperspirant Cream
45ml
1× CZK164.90CZK164.90
Rossini Primitivo Puglia IGT 0.75l
2× CZK99.90CZK199.80
Rossini Puglia IGT Pinot Grigio 0.75l
2× CZK89.90CZK179.80
Roman salad 1pc 280g
1× CZK29.90CZK29.90
Taco shells 135g
1× CZK80.90CZK80.90
Svijanský Rytíř 12% bottle 500ml
1× CZK13.90CZK13.90
return packages: 1× CZK3.00CZK3.00
Tomas Arsov Hold-Up hairspray with natural
fixation 300ml
1× CZK284.90CZK284.90
Treaclemoon Marshmallow Hearts shower gel
500ml
1× CZK109.90CZK109.90
Wrigley's Orbit Sugar-free chewing gum with melon
flavor 14g
1× CZK21.90CZK21.90
Transport and payment
DeliveryCZK0.00
Courier tipCZK100.00
Discount in credits-CZK3.00
Total price after discountCZK2,836.31
Payment methodBy card
Customer pays CZK0.00

Customer:
Biagio Nicodemo
Rybná 753/29, Prague 11000
Supplier:
VELKÁ PECKA s.r.o.
Karolinská 654/2, 186 00 Praha 8 – Karlín
Company Reg. No.: 03024130, VAT ID: CZ03024130
Deliver to:15.05.2026 15:00`

describe('parseRohlíkText – golden real receipt (order #1124981236)', () => {
  const r = parseRohlíkText(GOLDEN_RECEIPT)

  it('extracts the summary fields', () => {
    expect(r.invoiceNumber?.value).toBe('1124981236')
    expect(r.date?.value).toBe('2026-05-15')
    expect(Number(r.total?.value)).toBeCloseTo(2836.31, 2)
  })

  it('extracts all 30 line items (27 products + 3 fees)', () => {
    expect(r.lineItems).toHaveLength(30)
  })

  it('the item amounts sum to the invoice total', () => {
    const sum = r.lineItems.reduce((s, i) => s + Number(i.amount), 0)
    expect(sum).toBeCloseTo(Number(r.total?.value), 2)
  })

  it('parses a multi-buy item with unit price and line total (Bordeaux 2× → 239.80)', () => {
    const item = r.lineItems.find((i) => i.description === 'Bordeaux AOC GVG red wine 0.75l')
    expect(item).toBeDefined()
    expect(Number(item!.quantity)).toBe(2)
    expect(Number(item!.unit_price)).toBeCloseTo(119.9, 2)
    expect(Number(item!.amount)).toBeCloseTo(239.8, 2)
  })

  it('reassembles a wrapped product name (Air Wick … 250ml)', () => {
    const item = r.lineItems.find((i) => /^Air Wick/.test(i.description ?? ''))
    expect(item?.description).toBe(
      'Air Wick Automatic Spray Refill Scent of winter fruit 250ml'
    )
    expect(Number(item!.amount)).toBeCloseTo(99.9, 2)
  })

  it('parses a price row that pdf-parse wrapped onto two lines (Miil Cheese threads → 31.41)', () => {
    const item = r.lineItems.find((i) => i.description === 'Miil Cheese threads smoked 100g')
    expect(item).toBeDefined()
    expect(Number(item!.amount)).toBeCloseTo(31.41, 2)
  })

  it('does not truncate any product name to a trailing size fragment', () => {
    const truncated = r.lineItems.filter((i) =>
      /^\d+\s*(ml|g|pcs|l)\b/i.test(i.description ?? '')
    )
    expect(truncated).toHaveLength(0)
  })

  it('parses all four payment/deposit fee lines', () => {
    const byName = (n: string) => r.lineItems.find((i) => i.description === n)
    expect(Number(byName('Delivery')?.amount)).toBe(0)
    expect(Number(byName('Courier tip')?.amount)).toBe(100)
    expect(Number(byName('Discount in credits')?.amount)).toBe(-3)
    expect(Number(byName('Return packages')?.amount)).toBe(3)
  })

  it('does not leak header or footer lines into items', () => {
    const junk = r.lineItems.filter((i) =>
      /customer pays|delivery note|order #|velk[aá] pecka|company reg|^\**$/i.test(
        i.description ?? ''
      )
    )
    expect(junk).toHaveLength(0)
  })
})
