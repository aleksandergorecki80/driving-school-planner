---
change_id: calendar-now-line-indicator
title: Add a clear now-line indicator separating past from future slots in the calendar
status: implemented
created: 2026-09-06
updated: 2026-09-06
archived_at: null
---

## Notes

Roadmap TD-16 (`context/foundation/roadmap.md`). Flagged by user (2026-09-06)
via screenshot: past slots in `CalendarGrid.tsx` are only distinguished via
`aria-disabled:opacity-50` dimming — no clearly visible line/marker showing
exactly where "now" is.

Add a Google-Calendar-style horizontal now-line at the precise vertical
position of the current moment, on today's column only, using
`officeNowAsNaiveUTC()` (from `past-lesson-timezone-check`, TD-15) as the
time source — consistent with how past/future is already determined
elsewhere in this grid. Should update as time passes (own client-side tick,
not just on `AutoRefresh` polls), and position precisely within the
half-hour slot rather than snapping to the row boundary.

GitHub issue #87.

No frame or research doc — went straight to `/10x-plan` per user's request,
with codebase research done inline during planning (see plan.md's Current
State Analysis).
