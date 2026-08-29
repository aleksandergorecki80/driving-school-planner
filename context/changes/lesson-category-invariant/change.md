---
change_id: lesson-category-invariant
title: Lesson category invariant — Lesson aggregate + EXCLUDE constraints + RLS tightening
status: implementing
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
