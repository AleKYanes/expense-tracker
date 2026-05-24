import { describe, it, expect } from 'vitest'
import { parseRohlíkText, parseRohlikLines } from '../rohlíkParser'

// Verbatim lines from a real Rohlik delivery note receipt
const FIXTURE = [
  'Chicken breast fillets',
  '0.595 kg × CZK219.90/kg CZK130.84',
  '0.485 kg × CZK219.90/kg CZK106.65',
  '0.413 kg × CZK219.90/kg CZK90.82',
  '0.478 kg × CZK219.90/kg CZK105.11',
  'MASO! Beef minced',
  '0.613 kg × CZK299.90/kg CZK183.84',
  '0.611 kg × CZK299.90/kg CZK183.24',
  'Transport and payment',
  'Delivery CZK0.00',
  'Courier tip CZK20.00',
  'Discount in credits -CZK6.00',
  'Total price after discount CZK2,146.89',
  'Payment method By card',
  'Customer pays CZK0.00',
].join('\n')

describe('parseRohlíkText – fixture', () => {
  const result = parseRohlíkText(FIXTURE, 'test-fixture.pdf')

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
const FULL_RECEIPT_LINES = [
  // Standard items — price line embedded after \n
  'Dacello Turkey ham sliced 150g\n2× CZK53.91 CZK107.82',
  'Kitchin White Cannellini beans in tomato 4×200g\n3× CZK14.31 CZK42.93',
  'Kitchin Rice Basmati 500g\n1× CZK26.91 CZK26.91',
  'Kotányi Chilli mill 7g\n1× CZK87.90 CZK87.90',
  // Weight items — product name then one row per weight entry
  'Chicken breast fillets',
  '0.595 kg × CZK219.90/kg CZK130.84',  // × U+00D7
  '0.485 kg X CZK219.90/kg CZK106.65',  // X uppercase ASCII (Textract OCR variant)
  '0.413 kg X CZK219.90/kg CZK90.82',
  '0.478 kg X CZK219.90/kg CZK105.11',
  // More standard items
  'Leros Deep sleep 20g\n1× CZK73.90 CZK73.90',
  'Listerine Total Care 250ml\n1× CZK174.90 CZK174.90',
  'M&S Food Chilli Con Carne 300g\n1× CZK89.90 CZK89.90',
  // Second weight product
  'MASO! Beef minced',
  '0.613 kg × CZK299.90/kg CZK183.84',
  '0.611 kg X CZK299.90/kg CZK183.24',
  // Embedded price lines
  'Miil High protein curd dessert vanilla, pouch 125g\n6x CZK17.91 CZK107.46',
  'Miil Mozzarella 125g\n2× CZK20.61 CZK41.22',
  // Textract split this long description — first part has the price embedded,
  // second part ("retractable tape 15pcs") is an orphan continuation line
  'Moddia Garbage bags 35l with lime scent and retractable tape 15pcs\n1× CZK17.91 CZK17.91',
  'retractable tape 15pcs',              // continuation — must be discarded
  'Moddia Garbage bags 60l with easy tie 10pcs\n1× CZK22.41 CZK22.41',
  // Standard item immediately after orphan — must NOT absorb previous weight rows
  'Cool eggs size L 6pcs\n4× CZK45.90 CZK183.60',
  'Roman salad 1pc 280g\n1× CZK29.90 CZK29.90',
  'Santa Maria 230g\n1× CZK88.90 CZK88.90',
  'Santa Maria Tex Mex Fajita Seasoning Mix 230g\n2× CZK51.90 CZK103.80',
  'Yutto Peanutbutter Smooth 100% 350g\n1× CZK46.71 CZK46.71',
  'Yutto Roasted unsalted cashews 175g\n1× CZK44.91 CZK44.91',
  'Yutto Sunflower seeds shelled 500g\n1× CZK41.31 CZK41.31',
  // Payment section
  'Transport and payment',
  'Delivery CZK0.00',
  'Courier tip CZK20.00',
  'Discount in credits -CZK6.00',
  'Total price after discount CZK2,146.89',
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
