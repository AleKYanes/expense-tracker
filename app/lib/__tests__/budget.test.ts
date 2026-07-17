import { describe, it, expect } from 'vitest'
import { paydayFor, payPeriodFor, toISODate } from '../budget'

describe('paydayFor', () => {
  it('is the 15th when the 15th is a weekday', () => {
    // July 2026: the 15th is a Wednesday.
    const d = paydayFor(2026, 6)
    expect(toISODate(d)).toBe('2026-07-15')
    expect(d.getDay()).toBe(3)
  })

  it('moves to Friday the 14th when the 15th is a Saturday', () => {
    // August 2026: the 15th is a Saturday.
    expect(new Date(2026, 7, 15).getDay()).toBe(6)
    const d = paydayFor(2026, 7)
    expect(toISODate(d)).toBe('2026-08-14')
    expect(d.getDay()).toBe(5)
  })

  it('moves to Friday the 13th when the 15th is a Sunday', () => {
    // November 2026: the 15th is a Sunday.
    expect(new Date(2026, 10, 15).getDay()).toBe(0)
    const d = paydayFor(2026, 10)
    expect(toISODate(d)).toBe('2026-11-13')
    expect(d.getDay()).toBe(5)
  })

  it('never lands on a weekend across a full year', () => {
    for (let m = 0; m < 12; m++) {
      const dow = paydayFor(2026, m).getDay()
      expect(dow).toBeGreaterThanOrEqual(1)
      expect(dow).toBeLessThanOrEqual(5)
    }
  })

  it('handles month overflow into the next year', () => {
    const d = paydayFor(2026, 12) // January 2027
    expect(d.getFullYear()).toBe(2027)
    expect(d.getMonth()).toBe(0)
  })
})

describe('payPeriodFor', () => {
  it('starts this month when the date is on or after payday', () => {
    const p = payPeriodFor(new Date(2026, 6, 17)) // 17 Jul, payday was 15 Jul
    expect(toISODate(p.start)).toBe('2026-07-15')
    expect(toISODate(p.end)).toBe('2026-08-14') // Aug 15 is a Saturday
  })

  it('starts last month when the date is before payday', () => {
    const p = payPeriodFor(new Date(2026, 6, 10)) // 10 Jul, before payday
    expect(toISODate(p.start)).toBe('2026-06-15')
    expect(toISODate(p.end)).toBe('2026-07-15')
  })

  it('treats payday itself as the first day of the new period', () => {
    const p = payPeriodFor(new Date(2026, 6, 15))
    expect(toISODate(p.start)).toBe('2026-07-15')
  })

  it('crosses year boundaries', () => {
    const p = payPeriodFor(new Date(2027, 0, 2)) // 2 Jan 2027, before Jan payday
    expect(p.start.getFullYear()).toBe(2026)
    expect(p.start.getMonth()).toBe(11)
    expect(p.end.getFullYear()).toBe(2027)
    expect(p.end.getMonth()).toBe(0)
  })
})
