import { SLOT_START_HOUR, SLOT_COUNT } from './grid-constants'

// Independent of AutoRefresh's 30s poll — this is how often the now-line
// (and, sharing the same ticking "now", past-slot dimming) re-evaluates on
// its own between polls/navigations.
export const NOW_LINE_TICK_MS = 60_000

const WINDOW_START_MIN = SLOT_START_HOUR * 60
const WINDOW_END_MIN = WINDOW_START_MIN + SLOT_COUNT * 30

function isSameUTCDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

// Returns where to draw the now-line on `day`'s column for the given `now`
// instant, as a fraction in [0, 1) of the visible slot window — or null if
// the line shouldn't render on this day at all (wrong day, or now falls
// outside the visible window). Both `day` and `now` are compared using
// getUTC* accessors throughout: this app stores/labels times as naive local
// wall-clock time labeled UTC (see officeNowAsNaiveUTC), so a local-timezone
// Date getter or a raw Date.now() comparison would reintroduce the TD-15
// UTC-offset bug in a new code path.
export function computeNowLineTop(day: Date, now: Date): number | null {
  if (!isSameUTCDate(day, now)) return null

  const minutesSinceMidnight = now.getUTCHours() * 60 + now.getUTCMinutes()
  if (minutesSinceMidnight < WINDOW_START_MIN || minutesSinceMidnight >= WINDOW_END_MIN) {
    return null
  }

  return (minutesSinceMidnight - WINDOW_START_MIN) / (WINDOW_END_MIN - WINDOW_START_MIN)
}
