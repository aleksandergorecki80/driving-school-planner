---
change_id: calendar-week-jump-picker
title: Add a date picker to jump directly to a week from the week-range label
status: implemented
created: 2026-09-05
updated: 2026-09-05
archived_at: null
---

## Notes

TD-09 in roadmap.md. GitHub issue #73 (open). Flagged by user 2026-09-04: the
week-range label (e.g. "31 Aug – 6 Sept 2026", `formatWeekLabel()` in
`WeeklyCalendar.tsx`) is plain non-interactive text — the only navigation is
stepping one week at a time via Prev/Next. Make the label clickable, opening
a calendar/date-picker to jump directly to an arbitrary week.
