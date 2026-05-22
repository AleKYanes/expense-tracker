import type { ParsedField } from './types'

type RawField = {
  Type?: { Text?: string }
  ValueDetection?: { Text?: string; Confidence?: number }
  LabelDetection?: { Text?: string }
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

const CZECH_LABEL_MAP: Record<string, string> = {
  'celkem': 'TOTAL',
  'celkem k uhrade': 'TOTAL',
  'k uhrade': 'TOTAL',
  'celkova castka': 'TOTAL',
  'celkem vcetne dph': 'TOTAL',
  'castka celkem': 'TOTAL',
  'dph': 'TAX',
  'dan z pridane hodnoty': 'TAX',
  'dan': 'TAX',
  'datum': 'INVOICE_RECEIPT_DATE',
  'datum vystaveni': 'INVOICE_RECEIPT_DATE',
  'datum faktury': 'INVOICE_RECEIPT_DATE',
  'datum zdanitelneho plneni': 'INVOICE_RECEIPT_DATE',
  'datum uskutecneni plneni': 'INVOICE_RECEIPT_DATE',
  'cislo faktury': 'INVOICE_RECEIPT_ID',
  'c. faktury': 'INVOICE_RECEIPT_ID',
  'faktura c': 'INVOICE_RECEIPT_ID',
  'faktura cislo': 'INVOICE_RECEIPT_ID',
  'variabilni symbol': 'INVOICE_RECEIPT_ID',
  'var. symbol': 'INVOICE_RECEIPT_ID',
  'dodavatel': 'VENDOR_NAME',
  'prodejce': 'VENDOR_NAME',
  'spolecnost': 'VENDOR_NAME',
  'obchodni firma': 'VENDOR_NAME',
  'mena': 'CURRENCY',
}

export function applyCzechFallback(
  summaryFields: RawField[],
  found: Record<string, ParsedField>
): Record<string, ParsedField> {
  const result = { ...found }

  for (const field of summaryFields) {
    const typeText = field.Type?.Text ?? ''
    // Only try to reclassify fields Textract marked as OTHER or left untyped
    if (typeText !== 'OTHER' && typeText !== '') continue

    const labelNorm = normalize(field.LabelDetection?.Text ?? '')
    if (!labelNorm) continue

    const mappedType = CZECH_LABEL_MAP[labelNorm]
    if (!mappedType || result[mappedType]) continue

    result[mappedType] = {
      value: field.ValueDetection?.Text ?? null,
      confidence: field.ValueDetection?.Confidence ?? null,
      label: field.LabelDetection?.Text ?? null,
    }
  }

  return result
}

export function parseDateString(raw: string | null): string {
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // Czech: D.M.YYYY or DD.MM.YYYY
  const czMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (czMatch) {
    const [, d, m, y] = czMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // US: MM/DD/YYYY
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (usMatch) {
    const [, m, d, y] = usMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return ''
}
