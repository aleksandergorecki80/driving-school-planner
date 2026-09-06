import { describe, it, expect } from 'vitest'
import { officeNowAsNaiveUTC } from './office-time'

describe('officeNowAsNaiveUTC', () => {
  it('relabels a winter (CET, UTC+1) instant as Warsaw wall-clock time', () => {
    // 2026-01-15T10:00:00Z is winter — Warsaw is UTC+1 (CET) — wall clock is 11:00.
    const winterInstant = new Date('2026-01-15T10:00:00.000Z')
    const result = officeNowAsNaiveUTC(winterInstant)
    expect(result.toISOString()).toBe('2026-01-15T11:00:00.000Z')
  })

  it('relabels a summer (CEST, UTC+2) instant as Warsaw wall-clock time', () => {
    // 2026-07-15T10:00:00Z is summer — Warsaw is UTC+2 (CEST) — wall clock is 12:00.
    const summerInstant = new Date('2026-07-15T10:00:00.000Z')
    const result = officeNowAsNaiveUTC(summerInstant)
    expect(result.toISOString()).toBe('2026-07-15T12:00:00.000Z')
  })

  it('produces hour 0 (not 24) exactly at Warsaw midnight', () => {
    // 2026-01-14T23:00:00Z is winter (CET, UTC+1) — Warsaw wall clock is
    // exactly 2026-01-15T00:00. Some Intl.DateTimeFormat configurations
    // render midnight as "24:00" instead of "00:00", which would parse as
    // Number("24") and silently roll the date forward — hourCycle: 'h23' in
    // the implementation guards against exactly this.
    const warsawMidnightUtc = new Date('2026-01-14T23:00:00.000Z')
    const result = officeNowAsNaiveUTC(warsawMidnightUtc)
    expect(result.toISOString()).toBe('2026-01-15T00:00:00.000Z')
    expect(result.getUTCHours()).toBe(0)
    expect(result.getUTCDate()).toBe(15)
  })
})
