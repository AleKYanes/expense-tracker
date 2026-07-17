// Personal monthly budget, tracked per pay period rather than calendar month.
// Payday is the 15th; when the 15th falls on a weekend, pay arrives the
// preceding Friday.

export const MONTHLY_BUDGET = 13000
export const BUDGET_CURRENCY = 'CZK'

/** Payday for a given month: the 15th, or the Friday before if it's a weekend. */
export function paydayFor(year: number, monthIndex: number): Date {
  const d = new Date(year, monthIndex, 15)
  const dow = d.getDay()
  if (dow === 6) d.setDate(14) // Saturday → Friday the 14th
  else if (dow === 0) d.setDate(13) // Sunday → Friday the 13th
  return d
}

export type PayPeriod = {
  start: Date
  /** Exclusive — the next payday. */
  end: Date
}

/** The pay period containing the given date: latest payday ≤ date → next payday. */
export function payPeriodFor(date: Date): PayPeriod {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const thisPayday = paydayFor(day.getFullYear(), day.getMonth())
  if (day.getTime() >= thisPayday.getTime()) {
    return {
      start: thisPayday,
      end: paydayFor(day.getFullYear(), day.getMonth() + 1),
    }
  }
  return {
    start: paydayFor(day.getFullYear(), day.getMonth() - 1),
    end: thisPayday,
  }
}

/** YYYY-MM-DD in local time (toISOString would shift the date across UTC). */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
