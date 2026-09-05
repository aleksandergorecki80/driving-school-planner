import { describe, it, expect, afterEach } from 'vitest'
import { toLocalMidnight, toUTCMidnight } from './WeekPicker'

const ORIGINAL_TZ = process.env.TZ

function withTZ(tz: string, fn: () => void) {
  process.env.TZ = tz
  try {
    fn()
  } finally {
    process.env.TZ = ORIGINAL_TZ
  }
}

describe('WeekPicker timezone boundary conversions', () => {
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ
  })

  it('toLocalMidnight re-anchors a UTC-midnight calendar day to local midnight, behind UTC', () => {
    withTZ('America/New_York', () => {
      // 2026-09-21T00:00:00.000Z is a Monday.
      const utcMidnight = new Date('2026-09-21T00:00:00.000Z')
      const local = toLocalMidnight(utcMidnight)
      expect(local.getFullYear()).toBe(2026)
      expect(local.getMonth()).toBe(8) // September (0-indexed)
      expect(local.getDate()).toBe(21)
      expect(local.getHours()).toBe(0)
    })
  })

  it('toLocalMidnight re-anchors a UTC-midnight calendar day to local midnight, ahead of UTC', () => {
    withTZ('Europe/Warsaw', () => {
      const utcMidnight = new Date('2026-09-21T00:00:00.000Z')
      const local = toLocalMidnight(utcMidnight)
      expect(local.getFullYear()).toBe(2026)
      expect(local.getMonth()).toBe(8)
      expect(local.getDate()).toBe(21)
      expect(local.getHours()).toBe(0)
    })
  })

  it('toLocalMidnight is correct for a fractional UTC offset (UTC+5:30)', () => {
    withTZ('Asia/Kolkata', () => {
      const utcMidnight = new Date('2026-09-21T00:00:00.000Z')
      const local = toLocalMidnight(utcMidnight)
      expect(local.getFullYear()).toBe(2026)
      expect(local.getMonth()).toBe(8)
      expect(local.getDate()).toBe(21)
    })
  })

  it('toUTCMidnight re-anchors a local-midnight day to UTC midnight, ahead of UTC (the original bug: this offset direction previously shifted the day back by one)', () => {
    withTZ('Europe/Warsaw', () => {
      // A local midnight Date for Sept 21, as react-day-picker would return
      // for a click on "Monday, September 21".
      const localMidnight = new Date(2026, 8, 21)
      const utc = toUTCMidnight(localMidnight)
      expect(utc.toISOString()).toBe('2026-09-21T00:00:00.000Z')
    })
  })

  it('toUTCMidnight re-anchors a local-midnight day to UTC midnight, behind UTC', () => {
    withTZ('America/New_York', () => {
      const localMidnight = new Date(2026, 8, 21)
      const utc = toUTCMidnight(localMidnight)
      expect(utc.toISOString()).toBe('2026-09-21T00:00:00.000Z')
    })
  })

  it('round-trips through both conversions unchanged, regardless of timezone', () => {
    for (const tz of ['UTC', 'America/New_York', 'Europe/Warsaw', 'Asia/Kolkata', 'Pacific/Kiritimati']) {
      withTZ(tz, () => {
        const original = new Date('2026-09-21T00:00:00.000Z')
        const roundTripped = toUTCMidnight(toLocalMidnight(original))
        expect(roundTripped.toISOString()).toBe(original.toISOString())
      })
    }
  })
})
