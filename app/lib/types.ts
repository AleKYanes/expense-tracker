export type Category = {
  id: string
  name: string
  slug: string
  color: string | null
}

export type CategoryRule = {
  category_id: string
  match_text: string
  priority?: number   // higher = preferred when multiple rules match; default 100
}

export type ParsedField = {
  value: string | null
  confidence: number | null
  label: string | null
}

export type ParsedLineItem = {
  description: string | null
  quantity: string | null
  unit_price: string | null
  amount: string | null
  tax_amount: string | null
  confidence: number | null
}

export type ParsedResult = {
  vendor: ParsedField | null
  invoiceNumber: ParsedField | null
  date: ParsedField | null
  total: ParsedField | null
  tax: ParsedField | null
  currency: ParsedField | null
  lineItems: ParsedLineItem[]
}

export type ScanResult = {
  raw: unknown
  parsed: ParsedResult | null
}

export type ItemDraft = {
  description: string
  quantity: string
  unit_price: string
  amount: string
  tax_amount: string
  category_id: string
}

export type SaveExpenseInput = {
  vendor_name: string
  invoice_number: string
  invoice_date: string
  total_amount: number
  tax_amount: number | null
  currency: string
  category_id: string | null
  source_file_name: string
  raw_extraction_json: unknown
  confidence_score: number | null
  items: Array<{
    description: string
    quantity: number | null
    unit_price: number | null
    amount: number | null
    tax_amount: number | null
    category_id: string | null
    confidence_score: number | null
  }>
}
