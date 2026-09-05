---
change_id: calendar-week-transition-animation
title: Add a subtle transition animation when navigating between weeks
status: implementing
created: 2026-09-05
updated: 2026-09-05
archived_at: null
---

## Notes

TD-08 in roadmap.md. GitHub issue #72 (open). Flagged by user 2026-09-04:
`WeeklyCalendar`'s Prev/Next navigation swaps the visible week instantly via
`router.push()` — no transition. Add a subtle animation (slide/fade) on
`CalendarGrid`'s content when the week changes.
