// This app stores/displays lesson times as naive local wall-clock time
// labeled UTC (see src/lib/format-lesson-datetime.ts's hardcoded
// timeZone: 'UTC' formatting) — a deliberate simplification for this
// single-location driving school. Any comparison against "now" must use
// the office's real current wall-clock time, relabeled the same way,
// not the true UTC instant (Date.now()) — otherwise the comparison is
// off by the office's UTC offset (+1h winter, +2h summer for Warsaw).
export const OFFICE_TIMEZONE = 'Europe/Warsaw'

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const part = parts.find((p) => p.type === type)
  if (!part) {
    throw new Error(`Intl.DateTimeFormat did not produce a "${type}" part — cannot compute office-local time`)
  }
  return part.value
}

// Returns "now" (or the given reference instant), relabeled as if the
// office's real Europe/Warsaw wall-clock reading were UTC — matching this
// app's naive-local-as-UTC convention so the result is directly comparable
// against a stored scheduled_at.
export function officeNowAsNaiveUTC(reference: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(reference)

  const year = Number(getPart(parts, 'year'))
  const month = Number(getPart(parts, 'month'))
  const day = Number(getPart(parts, 'day'))
  const hour = Number(getPart(parts, 'hour'))
  const minute = Number(getPart(parts, 'minute'))
  const second = Number(getPart(parts, 'second'))

  return new Date(Date.UTC(year, month - 1, day, hour, minute, second))
}
