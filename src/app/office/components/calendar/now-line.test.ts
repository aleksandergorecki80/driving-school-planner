import { describe, it, expect } from 'vitest'
import { computeNowLineTop } from './now-line'

const day = new Date('2050-06-15T00:00:00.000Z')

describe('computeNowLineTop', () => {
  it('returns 0 at the exact window start (07:00)', () => {
    const now = new Date('2050-06-15T07:00:00.000Z')
    expect(computeNowLineTop(day, now)).toBe(0)
  })

  it('returns null at the exact window end boundary (21:00, exclusive)', () => {
    const now = new Date('2050-06-15T21:00:00.000Z')
    expect(computeNowLineTop(day, now)).toBeNull()
  })

  it('returns a fraction not aligned to a slot boundary for a mid-slot instant', () => {
    // 07:15 is 15 minutes into the first 30-min slot, i.e. halfway through it —
    // and 15 / 840 through the whole 14h window.
    const now = new Date('2050-06-15T07:15:00.000Z')
    expect(computeNowLineTop(day, now)).toBeCloseTo(15 / 840)
  })

  it('returns null before the window starts (05:00)', () => {
    const now = new Date('2050-06-15T05:00:00.000Z')
    expect(computeNowLineTop(day, now)).toBeNull()
  })

  it('returns null after the window ends (22:00)', () => {
    const now = new Date('2050-06-15T22:00:00.000Z')
    expect(computeNowLineTop(day, now)).toBeNull()
  })

  it('returns null when day is not the same UTC calendar date as now, regardless of time-of-day', () => {
    const otherDay = new Date('2050-06-16T00:00:00.000Z')
    const now = new Date('2050-06-15T13:00:00.000Z')
    expect(computeNowLineTop(otherDay, now)).toBeNull()
  })
})
