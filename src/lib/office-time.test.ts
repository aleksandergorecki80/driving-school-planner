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
})
