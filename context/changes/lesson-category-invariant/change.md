---
change_id: lesson-category-invariant
title: Lesson category invariant — Lesson aggregate + EXCLUDE constraints + RLS tightening
status: implemented
created: 2026-08-29
updated: 2026-08-29
archived_at: null
---

## Notes

Closes roadmap TD-01. Builds on `booking-integrity` (2026-07-04, implemented), which added
app-level guards for I1 (instructor holds category) and I4 (student double-booking) but left
I2 (student category coherence) completely unenforced and I3/I4 without any DB-level backstop.
This change fixes I2 and hardens I3/I4 at the database level in one pass, per the design in
`context/domain/02-invariant-aggregate-refactor.md`.

Key decisions locked in during planning (see `plan-brief.md` for the full table):
category equality as `text` now, no enum (not blocked on the licence-category list);
instructor-mismatch error wins over student-mismatch when both fail; `office_insert_lessons`
INSERT policy is dropped entirely, not narrowed; pre-migration verification query instead of
a backfill; concurrency test included in Phase 1; all existing user-facing error strings
preserved unchanged.

All 4 phases shipped 2026-08-29. Phases 1-3 merged via PR #60 (squashed). Phase 4 (this
session): dropped the superseded `lessons_instructor_slot_unique` index, synced `roadmap.md`'s
TD-01 entry to done, full verification (test/typecheck/lint/build) green.

**Sequencing fix discovered during implementation**: the plan originally had Phase 1 drop
`office_insert_lessons` immediately — implementation found this would break every lesson
booking for the entire gap until Phase 3 rewired `createLesson.ts` onto `book_lesson`. Moved
the `DROP POLICY` to Phase 3's migration instead, landing in the same commit as the
`createLesson.ts` rewrite, so the old and new write paths were never both broken/absent at
once. `plan.md` was updated to reflect this before Phase 3 shipped.

**Known, pre-existing gap not fixed here**: `e2e/office-books-lesson.spec.ts` fails on a stale
locator (`getByRole('option', { name: 'B' })` now matches both "B" and "B+E") — unrelated to
this change, already tracked as GitHub issue #30. The golden path was instead confirmed live via
`agent-browser` in Phase 3.
