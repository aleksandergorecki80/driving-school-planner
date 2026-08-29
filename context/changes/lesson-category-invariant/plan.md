# Lesson Category Invariant Implementation Plan

## Overview

Close roadmap TD-01: enforce the PRD's category-coherence rule ("all three must align for a
lesson to exist") for the student side, which today has **zero** enforcement at any layer, and
harden the two double-booking invariants (instructor, student) with real database constraints
instead of today's app-level check-then-insert. Introduce a `Lesson` domain aggregate whose
`propose()` factory is the single place both category rules are checked, backed by one new
Postgres RPC (`book_lesson`) that does the authoritative, atomic check-and-insert.

## Current State Analysis

`src/app/actions/lessons/createLesson.ts` (44 lines of business logic) makes five separate
round-trips to the database — fetch instructor, fetch student, check instructor-slot overlap,
check student-slot overlap, insert — and validates:

- **I1** (instructor holds the lesson's category) — `createLesson.ts:31-39`, enforced in TS.
  Shipped in `booking-integrity` (2026-07-04).
- **I3** (instructor double-booking) — `createLesson.ts:48-63`, enforced in TS only, backed by a
  DB unique index that catches only an *exact* duplicate `scheduled_at`
  (`supabase/migrations/20260628000002_add_unique_lesson_slot_index.sql`), not the ±1h window the
  app check uses.
- **I4** (student double-booking) — `createLesson.ts:65-80`, enforced in TS only, **zero** DB
  backstop. Also shipped in `booking-integrity`.
- **I2** (student holds the lesson's category) — **not enforced anywhere**. `createLesson.ts:41-45`
  fetches the student with `.select('id')` — the `category` column isn't even in the query, so no
  check is possible without first widening the select. The only place this rule is ever
  referenced is `NewLessonForm.tsx:51`, a client-side dropdown filter that has no bearing on what
  the server action actually accepts.

Root cause of "the DB can't help here today": `office_insert_lessons`
(`supabase/migrations/20260628000001_add_cancelled_lesson_status.sql:9-10`) is
`FOR INSERT TO authenticated WITH CHECK (true)` — any authenticated request can insert any row,
completely bypassing `createLesson.ts`.

`lessons.test.ts:361-435` already has a `describe('createLesson — category-coherence')` block from
`booking-integrity`, but it only covers I1 (instructor mismatch, instructor match) — zero test
cases exist for I2 (student mismatch).

## Desired End State

`createLesson` rejects an incoherent booking regardless of which layer it's called from — TS
action, direct RPC call, or a future second caller — because the authoritative check lives in the
database, not only in application code:

- A lesson whose category isn't in `student.category` is rejected with a new, parallel-construction
  error message, before any row is written.
- Two lessons cannot overlap (±1h, exclusive boundary) for the same instructor **or** the same
  student, even under concurrent requests — proven by a test that fires two real concurrent RPC
  calls and asserts exactly one succeeds.
- `office_insert_lessons`'s permissive `WITH CHECK (true)` is gone (dropped in Phase 3, once
  `createLesson.ts` no longer needs it); `book_lesson` (a `SECURITY DEFINER` RPC) is the only path
  that can write a `lessons` row for the office flow.
- Every existing `lessons.test.ts` assertion (lines 125–556) still passes unchanged — the public
  contract of `createLesson` (inputs, return shape, exact error strings for I1/I3/I4) does not
  change; only I2 is newly enforced and the string for it is new (never existed before).

### Key Discoveries

- `context/domain/02-invariant-aggregate-refactor.md` — the full DDD analysis and design this plan
  implements; treat it as authoritative background, not re-derived here.
- `supabase/migrations/20260704213336_lesson_token_functions.sql:16-45` (`respond_to_lesson`) is
  the exact pattern to mirror for `book_lesson`: `SECURITY DEFINER`, pinned `search_path`,
  `RETURNS TABLE(ok boolean, ...)` instead of raising, explicit `GRANT EXECUTE`.
- No `CREATE EXTENSION` statement exists in any of the 12 current migrations — `btree_gist` must
  be enabled fresh for the `EXCLUDE USING gist` constraints.
- `src/lib/supabase/test-client.ts` has `seedInstructor`/`seedStudent`/`seedLesson`/`cleanupRows`
  plus `createTestServiceRoleClient`/`createTestAnonClient`, but no authenticated-office client
  helper — `lessons.test.ts` instead wires an office session through `@supabase/ssr`'s
  `createServerClient` + a mutable cookie array, which exists specifically to feed
  `next/headers`'s mock for testing the *server action*. A DB-level RPC test (this plan's Phase 1)
  doesn't go through Next.js at all, so it needs a simpler authenticated client — see Phase 1.
- `src/lib/supabase/lesson-token.test.ts` is the precedent for testing a new RPC directly via
  `.rpc(...)` against the real hosted Supabase project, independent of any server action.
- `lessons.test.ts:221-253` and `:524-556` are the boundary tests ("exactly 1 hour later succeeds")
  that any new constraint must keep green — they define the exact tolerance the `tstzrange` in the
  `EXCLUDE` constraints must match.

## What We're NOT Doing

- Not converting `category` from `text` to a Postgres `enum` — equality-check enforcement doesn't
  need the finalized licence-category list (per planning discussion); enum-typing is a separate,
  later follow-up once that list is confirmed with the client.
- Not adding a Playwright/E2E test for I2 — per `CLAUDE.md`'s DOM-first rule, this isn't a
  browser-visible risk (the UI dropdown already filters correctly); the correct test layer is
  vitest at the server-action/RPC level (Phases 1 and 3).
- Not touching `cancelLesson.ts`, `respondToLesson.ts`, or `regenerateLessonToken.ts` — out of
  scope; they don't participate in the category-coherence or double-booking invariants.
- Not adding a data-backfill/repair step for existing violating rows — Phase 1 verifies none exist
  before adding the constraints; if verification finds any, that is a stop-and-decide moment for a
  human, not something this plan automates.
- Not narrowing `office_insert_lessons` to a partial `CHECK` as a second layer of defense — it is
  dropped entirely; `book_lesson` becomes the only write path (per planning discussion).
- Not changing any of the existing user-facing error strings for I1/I3/I4 — only I2 gets a new
  string, everything else is byte-for-byte preserved so existing test assertions keep passing.

## Implementation Approach

A `Lesson` aggregate (`src/domain/lesson/`) owns the category-coherence precondition (I1+I2 — one
PRD sentence, one guard) as an in-memory factory check for fast, DB-round-trip-free failure. A new
`book_lesson` RPC is the authoritative, atomic backstop for all four invariants (I1–I4) — it
re-derives instructor/student category data itself rather than trusting whatever the TS layer
computed, and folds today's five separate round-trips (two selects, two overlap checks, one
insert) into one transactional call. `createLesson.ts` becomes a thin coordinator: validate input
→ fetch profiles → `Lesson.propose()` (fast-fail) → `LessonRepository.save()` (authoritative) →
map any domain error to the existing (or, for I2, new) user-facing string.

## Critical Implementation Details

**Error precedence inside `book_lesson`**: check instructor-category mismatch before
student-category mismatch (matches `createLesson.ts`'s existing I1-before-I2-in-spirit ordering
and keeps behavior deterministic when both are wrong) — before attempting the `INSERT`, which is
the only step that can raise the `EXCLUDE` violations.

**Distinguishing which `EXCLUDE` constraint fired**: Postgres raises the same SQLSTATE
(`exclusion_violation`, `23P01`) for both the instructor and the student constraint. The exception
handler must inspect the constraint name via `GET STACKED DIAGNOSTICS` to tell them apart —
this is the one genuinely non-obvious piece of PL/pgSQL in this plan:

```sql
EXCEPTION WHEN exclusion_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint = 'lessons_instructor_no_overlap' THEN
    RETURN QUERY SELECT false, 'SLOT_UNAVAILABLE_INSTRUCTOR', NULL::uuid, NULL::uuid; RETURN;
  ELSE
    RETURN QUERY SELECT false, 'SLOT_UNAVAILABLE_STUDENT', NULL::uuid, NULL::uuid; RETURN;
  END IF;
```

**Pre-migration safety check (no backfill)**: before adding either `EXCLUDE` constraint, run a
one-off verification query for existing violations (category mismatch, or overlapping active
lessons for the same instructor/student) against the real project. If it returns zero rows, add
the constraints directly in the migration. If it returns any rows, stop — this plan does not
prescribe a repair strategy for real violating data; that requires a human decision.

## Phase 1: Postgres foundation — `book_lesson` RPC, `EXCLUDE` constraints, RLS tightening

### Overview

Build and prove, via a real-database integration test, the authoritative RPC and its two backing
constraints — before any TypeScript changes touch `createLesson.ts`.

### Changes Required:

#### 1. Pre-migration verification (manual, one-off)

**Intent**: Confirm the hosted Supabase project has zero rows that would violate either new
constraint, per "What We're NOT Doing."

**Contract**: Run a read-only query joining `lessons` to `instructors`/`students` on category
mismatch, and a self-join on `lessons` for overlapping active (`pending`/`confirmed`) rows sharing
an `instructor_id` or `student_id`. Zero rows in both → proceed. Any rows → stop and report back
before writing the migration.

#### 2. Enable `btree_gist`

**File**: new migration, e.g. `supabase/migrations/<timestamp>_book_lesson_invariants.sql`

**Intent**: `EXCLUDE USING gist` requires the `btree_gist` extension for the equality operator
class on `uuid` columns combined with the range overlap operator.

**Contract**: `CREATE EXTENSION IF NOT EXISTS btree_gist;` at the top of the new migration file.

#### 3. Two `EXCLUDE USING gist` constraints

**File**: same migration

**Intent**: Replace today's exact-duplicate-only unique index with constraints that reject any
*overlapping* ±1h window for the same instructor, and add the equivalent (today entirely absent)
constraint for the same student — both atomic under concurrency, unlike the app-level
check-then-insert they replace.

**Contract**:

```sql
ALTER TABLE lessons ADD CONSTRAINT lessons_instructor_no_overlap
  EXCLUDE USING gist (instructor_id WITH =,
    tstzrange(scheduled_at, scheduled_at + interval '1 hour') WITH &&)
  WHERE (status IN ('pending', 'confirmed'));

ALTER TABLE lessons ADD CONSTRAINT lessons_student_no_overlap
  EXCLUDE USING gist (student_id WITH =,
    tstzrange(scheduled_at, scheduled_at + interval '1 hour') WITH &&)
  WHERE (status IN ('pending', 'confirmed'));
```

Do **not** drop `lessons_instructor_slot_unique` in this migration — it stays as a redundant
safety net until Phase 4 confirms the new constraint is proven in production-shaped tests.

#### 4. `book_lesson` RPC

**File**: same migration

**Intent**: The one atomic, authoritative write path — re-derives instructor/student category
data itself (never trusts a caller-supplied array), checks I1 then I2, attempts the insert, and
classifies any `EXCLUDE` violation by constraint name (see Critical Implementation Details).

**Contract**: `book_lesson(p_instructor_id uuid, p_student_id uuid, p_category text,
p_scheduled_at timestamptz) RETURNS TABLE(ok boolean, error_code text, lesson_id uuid, token uuid)`,
`SECURITY DEFINER`, `SET search_path = public`, mirroring `respond_to_lesson`'s
return-structured-result-not-raise idiom. Error codes: `INSTRUCTOR_NOT_FOUND`,
`STUDENT_NOT_FOUND`, `INSTRUCTOR_CATEGORY_MISMATCH`, `STUDENT_CATEGORY_MISMATCH`,
`SLOT_UNAVAILABLE_INSTRUCTOR`, `SLOT_UNAVAILABLE_STUDENT`. On success, returns the new lesson's
`id` and `token`.

#### 5. Grant `book_lesson` to `authenticated`

**File**: same migration

**Intent**: Let an office session call the new RPC. **`office_insert_lessons` (the permissive
`WITH CHECK (true)` INSERT policy) is deliberately NOT dropped in this phase** — discovered
during implementation: `createLesson.ts` still inserts directly until Phase 3 rewires it onto
`book_lesson`; dropping the policy here would break every lesson booking for the entire gap
between Phase 1 and Phase 3 landing. Phase 3's migration drops it in the same commit as the
`createLesson.ts` rewrite instead, so the old write path and the new one are never both
broken/absent at once. (Also required a small fix vs. the original design: the still-live
`lessons_instructor_slot_unique` unique index raises `unique_violation`, not `exclusion_violation`,
on an exact-duplicate slot — `book_lesson`'s exception handler catches both, mapping
`unique_violation` to `SLOT_UNAVAILABLE_INSTRUCTOR` since that old index only ever guarded the
instructor side.)

**Contract**: `GRANT EXECUTE ON FUNCTION book_lesson(uuid, uuid, text, timestamptz) TO
authenticated;` (not `anon` — unlike `respond_to_lesson`, only a logged-in office session calls
this).

#### 6. Authenticated test client helper

**File**: `src/lib/supabase/test-client.ts`

**Intent**: Phase 1's test calls `book_lesson` directly via `.rpc(...)`, independent of any Next.js
server action — the existing `@supabase/ssr` + cookie-mock dance in `lessons.test.ts` exists to
feed `next/headers`, which isn't in play here. A plain signed-in client is enough and simpler.

**Contract**: `export async function createTestAuthenticatedClient()` — plain
`@supabase/supabase-js` `createClient(url, anonKey)` followed by
`.auth.signInWithPassword({ email: officeEmail, password: officePassword })`, throwing a
descriptive error on sign-in failure (matching the file's existing guard-block style, no `!`).
Reads `OFFICE_EMAIL`/`OFFICE_PASSWORD` the same way `lessons.test.ts` does today.

#### 7. RPC integration tests, including concurrency

**File**: `src/lib/supabase/book-lesson.test.ts` (new)

**Intent**: Prove every error code, the happy path, and — the one test that actually justifies
this migration over the app-level check it replaces — that two concurrent calls for an
overlapping slot cannot both succeed.

**Contract**: Cases: instructor-category mismatch → `INSTRUCTOR_CATEGORY_MISMATCH`; student-category
mismatch (instructor matches) → `STUDENT_CATEGORY_MISMATCH`; both mismatched →
`INSTRUCTOR_CATEGORY_MISMATCH` wins (per planning discussion); exact-duplicate slot, 30-minutes-
apart, and exactly-1-hour-apart (boundary, succeeds) for both instructor and student sides,
mirroring `lessons.test.ts:194–253,498–556`'s existing cases; a lesson on a `cancelled`/`rejected`
row's old slot succeeds (constraint is `WHERE status IN ('pending','confirmed')`); and a
concurrency case firing two `Promise.all`-parallel `book_lesson` calls for the same overlapping
instructor slot, asserting exactly one resolves `ok: true` and the other resolves
`SLOT_UNAVAILABLE_INSTRUCTOR`.

### Success Criteria:

#### Automated Verification:

- [ ] Pre-migration verification query returns zero rows on the hosted project
- [ ] Migration applies cleanly against the hosted Supabase project
- [ ] `npm run test -- src/lib/supabase/book-lesson.test.ts` passes, including the concurrency case
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Full pre-existing suite (`npm run test`) still green — this phase must not touch
      `office_insert_lessons` (see §5), so existing `createLesson.ts` behavior is unaffected

#### Manual Verification:

- Concurrency test result inspected once by hand to confirm it isn't a false-positive (e.g. both
  calls happened to serialize due to test-runner scheduling rather than the constraint actually
  being exercised under real overlap)

**Implementation Note**: Pause here for confirmation the pre-migration verification query came
back clean before applying the migration to the hosted project.

---

## Phase 2: `Lesson.propose()` domain aggregate

### Overview

The in-memory, DB-round-trip-free half of the invariant: a factory that can only construct a
`Lesson` when both category rules hold, giving fast feedback before any network call.

### Changes Required:

#### 1. `Lesson` aggregate and domain errors

**File**: `src/domain/lesson/Lesson.ts` (new)

**Intent**: One factory, `Lesson.propose()`, is the only legal way to construct a `Lesson`
instance; it throws a named, typed error the moment either category half of the rule fails,
checking instructor before student (matching Phase 1's `book_lesson` ordering).

**Contract**: `Lesson.propose(input: { instructor: { id: string; categories: string[] }; student:
{ id: string; category: string }; category: string; scheduledAt: Date }): Lesson`. Throws
`InstructorCategoryMismatchError` when `!instructor.categories.includes(category)`, else throws
`StudentCategoryMismatchError` when `student.category !== category`, else returns a `Lesson`
exposing `instructorId`, `studentId`, `category`, `scheduledAt` as readonly fields. No `!`
non-null assertions (guard blocks only, per project convention).

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test -- src/domain/lesson/Lesson.test.ts` passes — pure unit tests, no DB, covering:
      both-valid succeeds; instructor mismatch throws `InstructorCategoryMismatchError`; student
      mismatch (instructor valid) throws `StudentCategoryMismatchError`; both mismatched throws
      `InstructorCategoryMismatchError`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- None — pure logic, fully covered by the automated unit tests

---

## Phase 3: `LessonRepository`, `createLesson.ts` rewrite, and the missing I2 test cases

### Overview

Wire the aggregate to the RPC, replace `createLesson.ts`'s five round-trips with the new
propose-then-save flow, and add the I2 test cases the existing `category-coherence` describe
block has been missing since `booking-integrity`.

### Changes Required:

#### 1. `LessonRepository`

**File**: `src/domain/lesson/LessonRepository.ts` (new)

**Intent**: The only caller of the `book_lesson` RPC; translates its `error_code` column into the
same named domain error classes `Lesson.propose()` uses (for the category mismatches) plus two new
ones for slot conflicts, so `createLesson.ts` has one uniform catch/map regardless of which layer
caught the problem.

**Contract**: `class LessonRepository { constructor(db: SupabaseClient); async save(lesson: Lesson):
Promise<{ id: string; token: string }> }`. Calls `db.rpc('book_lesson', { p_instructor_id, ...
})`; a transport-level `error` from the RPC call itself propagates (not a domain error — becomes a
generic action failure, matching how other actions in this repo already treat unexpected
Supabase errors); a non-transport `!row.ok` maps `row.error_code` to
`InstructorCategoryMismatchError` / `StudentCategoryMismatchError` /
`SlotUnavailableError('instructor' | 'student')` / a generic not-found error, mirroring the sketch
in `context/domain/02-invariant-aggregate-refactor.md`'s KROK 4.

#### 2. Rewrite `createLesson.ts`

**File**: `src/app/actions/lessons/createLesson.ts`

**Intent**: Replace the five hand-rolled queries (instructor fetch, student fetch, instructor
overlap check, student overlap check, insert) with: fetch instructor + student (now including
`category` on the student select — the concrete fix for the gap that let I2 go unchecked) →
`Lesson.propose()` → `new LessonRepository(db).save(lesson)` → catch and map any thrown domain
error to a string. The `overrideEmail`/`sendLessonLink` side effect after a successful save is
unchanged (`createLesson.ts:98-114` today).

**Contract**: Public signature and return shape (`{ error?: string; warning?: string }`) are
unchanged. Error-string mapping: `InstructorCategoryMismatchError` → `'Instructor does not hold
this category'` (preserved, byte-for-byte); `StudentCategoryMismatchError` → `'Student is not
enrolled in this category'` (new — this rule never had a string before); `SlotUnavailableError('instructor')`
→ `'This slot is already booked'` (preserved); `SlotUnavailableError('student')` → `'Student is
already booked at this time'` (preserved); instructor/student not-found → `'Instructor not found'`
/ `'Student not found'` (preserved, still checked pre-`propose()` as today).

#### 3. Drop the permissive INSERT policy

**File**: new migration, e.g. `supabase/migrations/<timestamp>_drop_office_insert_lessons.sql`

**Intent**: Now that `createLesson.ts` writes exclusively through `book_lesson`, close the gap
described in Phase 1's "Root cause" — the permissive policy is dropped in the same commit as the
rewrite above, so the old (direct-insert) and new (RPC) write paths are never both broken/absent
at the same time. Moved here from Phase 1 during implementation — see Phase 1 §5.

**Contract**: `DROP POLICY "office_insert_lessons" ON lessons;`

#### 4. Missing I2 test cases

**File**: `src/app/actions/lessons.test.ts`

**Intent**: Extend the existing `describe('createLesson — category-coherence')` block
(`:361-435`) — seeded fixture already has `categories: ['C']` on the instructor — with the student
side of the same rule, which today has zero coverage.

**Contract**: Two new cases in the existing block, seeding a student with `category: 'B'` (differs
from the instructor's `'C'`): (a) category `'C'` (matches instructor, not the student) →
`result.error === 'Student is not enrolled in this category'`, zero rows inserted; (b) both
mismatched (`category: 'B'`, matches neither) → `'Instructor does not hold this category'` wins
(I1-before-I2 ordering, per planning discussion). All pre-existing cases in this file
(`:125-556`) must still pass unchanged — this is the regression net proving the rewrite didn't
change the public contract.

### Success Criteria:

#### Automated Verification:

- [ ] New I2 test cases committed and failing against the pre-rewrite `createLesson.ts` (red —
      confirms the gap is real before the fix lands)
- [ ] `npm run test -- src/app/actions/lessons.test.ts` passes in full (all pre-existing + new
      cases) after the rewrite lands (green)
- [ ] `office_insert_lessons` policy no longer present after this phase's migration
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- Booking a lesson through the actual `NewLessonForm` UI still succeeds end-to-end for a coherent
  student/instructor/category combination (smoke check that the rewrite didn't regress the golden
  path — deeper E2E coverage happens in Phase 4)

**Implementation Note**: Pause here for confirmation before Phase 4's cleanup.

---

## Phase 4: Cleanup and E2E verification

### Overview

Remove the now-superseded exact-duplicate index and confirm the golden path still works through a
real browser, closing out the roadmap entry.

### Changes Required:

#### 1. Drop the superseded unique index

**File**: new migration, e.g. `supabase/migrations/<timestamp>_drop_superseded_lesson_slot_index.sql`

**Intent**: `lessons_instructor_slot_unique` (exact-duplicate-only) is now fully subsumed by
`lessons_instructor_no_overlap` (±1h window) proven in Phase 1 — keeping both is redundant.

**Contract**: `DROP INDEX lessons_instructor_slot_unique;`

#### 2. Roadmap sync

**File**: `context/foundation/roadmap.md`

**Intent**: Close out TD-01 in the Backlog Handoff table now that it's implemented.

**Contract**: Update the TD-01 row's status/notes to reflect completion, referencing this change's
commit(s).

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: index no longer present (`\d lessons` or equivalent check)
- [ ] Full test suite passes: `npm run test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`

#### Manual Verification:

- `e2e/office-books-lesson.spec.ts` golden path run manually against the dev server and passes
- A manual attempt to book a lesson for a student whose category doesn't match, via the running
  app (not just the test suite), is rejected with the new error message in the UI

---

## Testing Strategy

### Unit Tests:

- `Lesson.propose()` (Phase 2) — pure, no I/O, covers both category halves and the
  instructor-wins-when-both-fail ordering.

### Integration Tests:

- `book-lesson.test.ts` (Phase 1) — RPC-level, real hosted DB, all error codes plus the
  concurrency proof.
- `lessons.test.ts` (Phase 3) — server-action-level, real hosted DB, full regression suite plus
  the two new I2 cases.

### Manual Testing Steps:

1. After Phase 3: book a coherent lesson through `NewLessonForm` end-to-end.
2. After Phase 4: run `e2e/office-books-lesson.spec.ts` against the dev server.
3. After Phase 4: attempt an incoherent student/category booking through the running app and
   confirm the new error message surfaces in the UI, not just in tests.

## Performance Considerations

`book_lesson` folds five round-trips into one — a net latency improvement for `createLesson`, not
a regression. `EXCLUDE USING gist` on a `tstzrange` is the standard Postgres pattern for this kind of
overlap constraint and performs comparably to a btree index at this table's scale (a driving
school's lesson volume, not a high-throughput table).

## Migration Notes

Phase 1's pre-migration verification query is the migration safety net for existing data — see
"What We're NOT Doing." No lesson rows are altered by any migration in this plan, only new
constraints, a new function, and a policy removal.

## References

- Domain design: `context/domain/02-invariant-aggregate-refactor.md`
- Prior art (I1, I4 app-level): `context/changes/booking-integrity/plan.md`
- RPC pattern to mirror: `supabase/migrations/20260704213336_lesson_token_functions.sql:16-45`
- Roadmap entry: `context/foundation/roadmap.md` (TD-01, Backlog Handoff table)
- Code to replace: `src/app/actions/lessons/createLesson.ts`
- Existing regression suite: `src/app/actions/lessons.test.ts:125-556`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Postgres foundation — `book_lesson` RPC, `EXCLUDE` constraints, RLS tightening

#### Automated

- [x] 1.1 Pre-migration verification query returns zero rows on the hosted project
- [x] 1.2 Migration applies cleanly against the hosted Supabase project
- [x] 1.3 `npm run test -- src/lib/supabase/book-lesson.test.ts` passes, including the concurrency case
- [x] 1.4 Type checking passes: `npm run typecheck`
- [x] 1.5 Linting passes: `npm run lint`
- [x] 1.7 Full pre-existing suite (`npm run test`) still green — confirms leaving `office_insert_lessons` in place this phase avoided the interim breakage found during implementation

#### Manual

- [x] 1.6 Concurrency test result inspected once by hand to confirm it isn't a false-positive

### Phase 2: `Lesson.propose()` domain aggregate

#### Automated

- [x] 2.1 `npm run test -- src/domain/lesson/Lesson.test.ts` passes (all four cases)
- [x] 2.2 Type checking passes: `npm run typecheck`
- [x] 2.3 Linting passes: `npm run lint`

### Phase 3: `LessonRepository`, `createLesson.ts` rewrite, and the missing I2 test cases

#### Automated

- [ ] 3.1 New I2 test cases committed and failing against pre-rewrite `createLesson.ts` (red)
- [ ] 3.2 `npm run test -- src/app/actions/lessons.test.ts` passes in full after the rewrite (green)
- [ ] 3.3 `office_insert_lessons` policy no longer present after this phase's migration
- [ ] 3.4 Type checking passes: `npm run typecheck`
- [ ] 3.5 Linting passes: `npm run lint`

#### Manual

- [ ] 3.6 Booking a coherent lesson through `NewLessonForm` still succeeds end-to-end

### Phase 4: Cleanup and E2E verification

#### Automated

- [ ] 4.1 Migration applies cleanly: superseded index no longer present
- [ ] 4.2 Full test suite passes: `npm run test`
- [ ] 4.3 Type checking passes: `npm run typecheck`
- [ ] 4.4 Linting passes: `npm run lint`
- [ ] 4.5 Production build succeeds: `npm run build`

#### Manual

- [ ] 4.6 `e2e/office-books-lesson.spec.ts` golden path run manually against the dev server and passes
- [ ] 4.7 A manual incoherent-category booking attempt through the running app is rejected with the new error message
