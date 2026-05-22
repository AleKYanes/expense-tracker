/**
 * parseMoney — robust Czech/European and US money string parser.
 *
 * Algorithm:
 *   1. Strip everything that isn't a digit, comma, period, or minus (removes Kč, €, $, spaces, etc.)
 *   2. Collapse/remove all remaining whitespace
 *   3. Decide decimal separator by which separator appears last:
 *      - comma last AND ≤2 digits follow it  → Czech/European ("29,90" "2 126,89")
 *      - period last                          → US decimal  ("2126.89" "2,126.89")
 *      - comma last AND 3 digits follow it    → US thousands ("1,234" → 1234)
 *   4. parseFloat
 */
export function parseMoney(raw: string | null | undefined): number | null {
  if (!raw) return null

  // Replace every non-numeric character (currency symbols, Kč, spaces, etc.) with a space.
  // Keep: digit  comma  period  minus
  let s = raw.replace(/[^\d,.\-]/g, ' ')

  // Collapse runs of whitespace and trim.
  s = s.replace(/\s+/g, ' ').trim()

  // Remove remaining spaces (covers regular space, non-breaking space U+00A0, etc.).
  s = s.replace(/ /g, '')

  if (!s || s === '-' || s === '.') return null

  const lastComma = s.lastIndexOf(',')
  const lastPeriod = s.lastIndexOf('.')

  if (lastComma === -1 && lastPeriod === -1) {
    // Plain integer — no separators at all.
    const v = parseFloat(s)
    return isNaN(v) ? null : v
  }

  if (lastComma > lastPeriod) {
    // Comma is the rightmost separator.
    const decimalsAfterComma = s.length - lastComma - 1
    if (decimalsAfterComma <= 2) {
      // Czech/European decimal comma: "29,90" → 29.90  |  "2126,89" → 2126.89
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // 3 digits after comma → US thousands comma: "1,234" → 1234
      s = s.replace(/,/g, '')
    }
  } else {
    // Period is rightmost → US/ISO decimal.  Remove commas (they were thousands separators).
    s = s.replace(/,/g, '')
  }

  const v = parseFloat(s)
  return isNaN(v) ? null : v
}

/**
 * Verify parseMoney against known Czech and US inputs.
 * Call this in the browser console or server console during development:
 *   import { runParseMoneySelfTest } from '@/app/lib/parseMoney'
 *   runParseMoneySelfTest()
 */
export function runParseMoneySelfTest(): void {
  const cases: Array<[string, number]> = [
    ['2 126,89 Kč',  2126.89],
    ['29,90 Kč',     29.9   ],
    ['-6,00 Kč',     -6     ],
    ['1 884,09 Kč',  1884.09],
    ['242,80 Kč',    242.8  ],
    ['0,00 Kč',      0      ],
    ['2126.89',      2126.89],
    ['2,126.89',     2126.89],
    ['1.234,56',     1234.56],
    ['100',          100    ],
    ['87,90 Kč',     87.9   ],
    ['174,90 Kč',    174.9  ],
    ['183,60 Kč',    183.6  ],
    ['433,42 Kč',    433.42 ],
    ['367,08 Kč',    367.08 ],
  ]

  let pass = 0, fail = 0
  for (const [input, expected] of cases) {
    const result = parseMoney(input)
    const ok = result != null && Math.abs(result - expected) < 0.0001
    if (ok) {
      pass++
    } else {
      console.error(`FAIL parseMoney("${input}"): expected ${expected}, got ${result}`)
      fail++
    }
  }
  console.log(`parseMoney self-test: ${pass}/${pass + fail} passed${fail > 0 ? ' ← FAILURES ABOVE' : ' ✓'}`)
}
