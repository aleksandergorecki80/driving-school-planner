---
change_id: lesson-block-status-badge
title: Add a status badge/label to lesson blocks in the calendar grid
status: implementing
created: 2026-09-06
updated: 2026-09-06
archived_at: null
---

## Notes

Roadmap TD-14 (`context/foundation/roadmap.md`). Flagged by user (2026-09-05)
via screenshot: `LessonBlock`
(`src/app/office/components/calendar/LessonBlock.tsx`) conveys status
(pending/confirmed/rejected) only via border/background color
(`LESSON_STATUS[...].chipClassName`) — no text label on the tile itself,
only student name + category. Color-only status coding is an accessibility
gap and gives new users no way to learn the color mapping without opening
the popover.

Fix: reuse `LESSON_STATUS[lesson.status].label` (already defined in
`src/components/lesson/lesson-status.ts`) as a compact badge/label on the
tile.

Explicitly scoped out of TD-11 (`office-rejection-reason-display`) in favor
of a popover-only fix; picked up here as its own item.

GitHub issue #81.
