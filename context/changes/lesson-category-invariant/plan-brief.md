# Lesson Category Invariant — Plan Brief

> Full plan: `context/changes/lesson-category-invariant/plan.md`
> Domain design: `context/domain/02-invariant-aggregate-refactor.md`

## What & Why

Roadmap TD-01: `createLesson` enforces "the instructor holds the lesson's category" but never
checks the matching PRD rule for the student — the code doesn't even fetch `students.category`.
The only guard is a client-side dropdown filter, which any direct call to the server action (bug,
future component, script) bypasses entirely. This plan closes that gap and, since fixing it means
moving lesson creation into one atomic database transaction anyway, also gives the two
double-booking rules (instructor, student) a real database backstop instead of today's
non-atomic check-then-insert.

## Starting Point

`booking-integrity` (2026-07-04, implemented) already added app-level guards for instructor-category
match and student double-booking. What's left, unchanged since then: student-category coherence
(zero enforcement anywhere) and database-level hardening for both double-booking rules (today only
an exact-duplicate-timestamp unique index exists; the app's ±1h window logic has no DB backing and
is vulnerable to a race between two concurrent requests).

## Desired End State

Office staff booking a lesson for a student whose category doesn't match sees a clear rejection
before anything is saved — the same way an instructor-category mismatch is rejected today. Two
overlapping bookings for the same instructor or the same student are impossible even if two
requests race each other, because the database itself refuses the second write.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Error precedence when both mismatch | Instructor-category error wins | Matches today's implicit I1-before-I2 code shape; deterministic | Plan (asked) |
| `office_insert_lessons` RLS shape | Drop the INSERT policy entirely | `book_lesson` becomes the only write path — closes the gap completely, not partially | Plan (asked) |
| Category type | `text` equality now, no enum | Equality doesn't need the finalized licence-category list; unblocks the fix immediately | Plan (asked) |
| Existing-data safety | Verify-before-migrate, no backfill logic | Small dataset; a real violation found is a human decision, not something to automate away | Plan (asked) |
| Concurrency proof | Include a real two-parallel-calls test in Phase 1 | It's the only test that actually proves `EXCLUDE` beats the app-level race it replaces | Plan (asked) |
| User-facing error copy | Preserve every existing string exactly | Zero UX regression risk, zero unrelated test churn | Plan (asked) |

## Scope

**In scope:**
- New `Lesson` domain aggregate (`propose()` factory) enforcing both category halves in TS
- New `book_lesson` Postgres RPC — atomic, authoritative check-and-insert
- Two new `EXCLUDE USING gist` constraints (instructor, student)
- Dropping the permissive `office_insert_lessons` INSERT policy
- Rewriting `createLesson.ts` into a thin coordinator
- The missing I2 test cases in `lessons.test.ts`

**Out of scope:**
- Converting `category` to an enum (needs the finalized licence-category list — separate follow-up)
- Any change to `cancelLesson`, `respondToLesson`, `regenerateLessonToken`
- A new Playwright/E2E spec for I2 (not a browser-visible risk per `CLAUDE.md`'s DOM-first rule)
- Backfilling or repairing any existing violating data

## Architecture / Approach

`Lesson.propose()` is the fast, in-memory half of the invariant (fails before any network round
trip). `book_lesson` is the authoritative, atomic half — it re-derives category data itself rather
than trusting the caller, folding today's five separate queries into one transaction, and is the
*only* remaining way to write a `lessons` row once the permissive RLS policy is dropped.
`createLesson.ts` calls both in sequence and maps whichever error surfaces to a user-facing string.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Postgres foundation | `book_lesson` RPC, two `EXCLUDE` constraints, RLS tightened, concurrency proven | Existing data might violate the new constraints — verified first, not assumed |
| 2. `Lesson.propose()` | Pure domain aggregate, unit-tested | Low — no I/O, no DB |
| 3. Repository + `createLesson.ts` rewrite | I2 finally enforced; full regression suite green | Rewrite must not change any existing error string or the public contract |
| 4. Cleanup + E2E | Superseded index dropped, golden path proven in a real browser | None significant — verification-only phase |

**Prerequisites:** None blocking — `booking-integrity` (prerequisite work) already shipped.
**Estimated effort:** ~3-4 sessions across 4 phases (Phase 1 is the heaviest: new SQL, new RPC, a
concurrency test).

## Open Risks & Assumptions

- Assumes the hosted Supabase project has no existing rows that violate the new constraints —
  Phase 1's verification step confirms this before applying the migration; if it finds violations,
  this plan does not prescribe what to do next.
- The concurrency test's reliability depends on the test runner and Supabase connection actually
  overlapping two requests in time — Phase 1 includes one manual inspection of that result as a
  sanity check.

## Success Criteria (Summary)

- Booking a lesson for a category-mismatched student is rejected, with no row written, exactly
  like the existing instructor-mismatch case.
- Two concurrent overlapping bookings for the same instructor or student can never both succeed.
- Every existing `lessons.test.ts` assertion still passes unchanged.
