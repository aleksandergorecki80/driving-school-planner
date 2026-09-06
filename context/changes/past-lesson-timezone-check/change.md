---
change_id: past-lesson-timezone-check
title: Fix timezone bug letting past lessons slip through the past-time check
status: implementing
created: 2026-09-05
updated: 2026-09-06
archived_at: null
---

## Notes

Bug report from user (2026-09-05, screenshot): booked a lesson at 15:30 while
real local time was 17:03 — the office's PC clock (macOS menu bar) confirmed
"Sat Sep 5 17:03" — and both the UI click-guard AND the server-side RPC let it
through; the lesson was actually created (id 5a447237-bc5f-49ee-a19f-6ceeb2a8dc23,
instructor Anna Nowak, student Adam Wójcik, scheduled_at 2026-09-05T15:30:00+00:00,
created_at 2026-09-05T15:05:17 UTC) — cancelled manually via service-role client
during triage, not left in the live DB.

Root cause confirmed by direct code inspection (not guessed):

This app stores/displays lesson times as "naive local wall-clock time labeled
as UTC" — confirmed deliberate design via `src/lib/format-lesson-datetime.ts`'s
hardcoded `timeZone: 'UTC'` formatting (so "15:30" always displays as "15:30"
regardless of viewer's browser timezone). A slot labeled "15:30" in the grid
is stored as `15:30 UTC`.

But three separate past-time checks compare this naive-labeled value against
the TRUE current UTC instant (`Date.now()` / SQL `now()`), not against "the
current time, relabeled the same naive way":

- `src/app/office/components/calendar/CalendarGrid.tsx:79` —
  `slotDate.getTime() < Date.now()`
- `src/domain/lesson/Lesson.ts:49-50` —
  `input.scheduledAt.getTime() < Date.now()`
- `supabase/migrations/20260901090000_book_lesson_past_scheduled_at.sql` —
  `IF p_scheduled_at < now() THEN ...`

Poland is UTC+2 (CEST) in September. Real time 17:03 local = 15:03 UTC.
Comparing `15:30 UTC < 15:03 UTC` is false — the "15:30" slot is wrongly
considered still in the future (off by ~2h, the local UTC offset), even
though real Warsaw wall-clock time is well past it.

Pre-existing bug in TD-06 (`no-past-lesson-scheduling`, shipped 2026-09-04,
commit range around PR #70) — NOT introduced by today's TD-08/TD-09 work.
All three checks need to compare against "now, relabeled the same naive way"
(i.e., the office's real local wall-clock date/time components, reinterpreted
as UTC), not against the true UTC epoch. The office's timezone (Europe/Warsaw,
presumably) needs to be determined for the two server-side checks (client-side
can safely use the browser's own local `Date` getters, assuming staff are
physically in the same timezone as the school).

Root cause already verified via direct code reading — no /10x-frame or
/10x-research needed; going straight to /10x-plan per user's choice.
