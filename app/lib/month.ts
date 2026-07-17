export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Parse a ?month=YYYY-MM param into the first day of that month.
 * Invalid values and future months fall back to the current month.
 */
export function parseMonthParam(param: string | undefined, now: Date): Date {
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  if (param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) {
    const [y, m] = param.split('-').map(Number)
    const candidate = new Date(y, m - 1, 1)
    if (candidate.getTime() <= currentMonthStart.getTime()) return candidate
  }
  return currentMonthStart
}
