# Booking Integrity Implementation Plan

## Overview

Add two missing server-side guards to `createLesson` — category-coherence (Risk #3) and
student double-booking (Risk #2) — and prove each guard works via TDD integration tests.
Closes test-plan §3 Phase 2 ("Booking integrity").

## Current State Analysis

`createLesson` (`src/app/actions/lessons.ts`) validates: timestamp format, authentication,
instructor existence, student existence, and instructor-slot overlap. It does NOT:

- Check that `category` is in `instructor.categories` (Risk #3 gap)
- Check whether the student already has an overlapping lesson with a different instructor (Risk #2 gap)

Category filtering is currently client-side only (`InstructorSidebar.tsx:35–38`). A direct
server action call bypasses it entirely.

The existing instructor-overlap check (lines 43–58) uses a ±1 hour exclusive window:
`windowStart = slotStart − 1h`, `slotEnd = slotStart + 1h`, filters `status IN ('pending','confirmed')`.
The student-overlap guard follows the same logic.

## Desired End State

`createLesson` rejects any call where:
- the submitted `category` is not present in `instructor.categories` → `{ error: 'Instructor does not hold this category' }`
- the student already has a `pending` or `confirmed` lesson within the 1-hour window → `{ error: 'Student is already booked at this time' }`

`lessons.test.ts` contains integration tests proving both rejections occur regardless of what
the UI submitted, verified against the real DB. The `test-plan.md §6.2` cookbook entry is
filled in with the server action integration test pattern.

### Key Discoveries

- `instructors.categories` is `text[] NOT NULL` (`supabase/migrations/20260614143835_initial_schema.sql`)
- `lessons.category` is `text NOT NULL` — single value; no DB-level constraint links the two
- Current instructor SELECT: `.select('id')` — categories not fetched; must change to `.select('id, categories')`
- `seedInstructor` already accepts `{ categories: string[] }` override (`test-client.ts:33`) — no helper changes needed
- Existing `lessons.test.ts` suite signs in as office user in `beforeAll` and uses `createServerClient` with a mutable cookie store — new describe blocks must replicate this pattern

## What We're NOT Doing

- No DB-level category constraint (explicitly deferred; no migration needed)
- No category validation in `cancelLesson` (out of scope for this plan)
- No UI changes (client-side filtering stays as-is; this plan adds the server layer)
- No `cancelLesson` edge case tests (separate concern, not in test-plan Phase 2)

## Implementation Approach

TDD for both risks: write the failing test first, confirm it fails against the current code,
then add the minimal guard to make it pass. Each risk is one phase so failures can be
isolated during the red step. Phase 3 updates the cookbook once both guards are proven.

## Critical Implementation Details

**TDD red-step**: the new tests must be committed and run BEFORE the guard is added to
`lessons.ts`. This confirms the test is real — it catches the bug that currently exists —
not a vacuous test that passes against the broken code.

**Describe block isolation**: each new describe block needs its own `beforeAll` (sign-in +
seed) and `afterAll` (cleanup). The category-coherence block seeds an instructor with
`categories: ['C']`; the student double-booking block seeds two instructors with
`categories: ['B']` and one shared student. Do not share fixture state across describe blocks.

**Guard ordering in `createLesson`**: the category guard goes immediately after the
instructor null-check (line 34). The student-overlap query goes after the instructor-overlap
block (line 58), before the INSERT.

---

## Phase 1: Risk #3 — Category-coherence guard (TDD)

### Overview

Prove — via a failing test — that the current `createLesson` accepts a mismatched
category, then add the minimal guard to reject it.

### Changes Required

#### 1. New describe block in `src/app/actions/lessons.test.ts`

**File**: `src/app/actions/lessons.test.ts`

**Intent**: Add a `describe('createLesson — category-coherence')` block that seeds an
instructor with `categories: ['C']` and asserts that calling `createLesson` with
`category: 'B'` returns `{ error: 'Instructor does not hold this category' }` and inserts
no row. Add a positive case: the same instructor with `category: 'C'` succeeds.

**Contract**: Follows the existing suite's sign-in pattern (same `sessionCookies` mutable
store, same `createServerClient` wiring). Fixture: `seedInstructor(svc, { categories: ['C'] })`.
Two test cases:
1. `category: 'B'` → `result.error === 'Instructor does not hold this category'`; DB query for that instructorId + scheduledAt returns no row.
2. `category: 'C'` → `result` equals `{}`; DB row exists with `status: 'pending'`.

First failing assertion (TDD red):
```
expect(result.error).toBe('Instructor does not hold this category')
```
This assertion fails against the current code because `createLesson` returns `{}` instead of an error.

#### 2. Guard in `src/app/actions/lessons.ts`

**File**: `src/app/actions/lessons.ts`

**Intent**: After verifying the instructor exists, check that the submitted `category` is
present in `instructor.categories`. Return an error immediately if not.

**Contract**: Change the instructor SELECT from `.select('id')` to `.select('id, categories')`.
Add a guard block immediately after the instructor null-check (currently line 34):
```typescript
if (!instructor.categories.includes(category)) {
  return { error: 'Instructor does not hold this category' }
}
```

### Success Criteria

#### Automated

- Phase 1 test block committed; `npm test` exits with at least 1 failure from the new
  describe block (red state — confirms the test is real before the guard exists)
- `npm test` exits 0 after the guard is added to `lessons.ts`
- `npm run build` exits 0
- `npm run lint` exits 0

#### Manual

- None — the integration test is the full verification for this risk

---

## Phase 2: Risk #2 — Student double-booking guard (TDD)

### Overview

Prove — via a failing test — that the current `createLesson` allows the same student to be
booked into two simultaneous lessons with different instructors, then add the guard that
rejects it.

### Changes Required

#### 1. New describe block in `src/app/actions/lessons.test.ts`

**File**: `src/app/actions/lessons.test.ts`

**Intent**: Add a `describe('createLesson — student double-booking')` block that seeds two
instructors (both with `categories: ['B']`) and one shared student. Book the student with
instructor A at BASE_TIME (success). Then attempt to book the same student with instructor B
at BASE_TIME and within the 1-hour window; both attempts must return an error.

**Contract**: Same sign-in wiring as existing suite. Fixtures: `seedInstructor × 2`,
`seedStudent × 1`. The first `createLesson` call (instructorA + student + BASE_TIME) goes
through without error. Three test cases:
1. Exact same slot (instructorB + student + BASE_TIME) → `result.error === 'Student is already booked at this time'`; no second row inserted.
2. Slot 30 minutes later (still within 1-hour window) → same error.
3. Slot exactly 1 hour later (boundary) → `result` equals `{}` (no overlap — mirrors the existing instructor boundary test).

First failing assertion (TDD red):
```
expect(second.error).toBe('Student is already booked at this time')
```
This assertion fails against the current code because `createLesson` returns `{}`.

#### 2. Student-overlap query in `src/app/actions/lessons.ts`

**File**: `src/app/actions/lessons.ts`

**Intent**: After the instructor-overlap check (currently lines 43–58), add an equivalent
query filtering by `student_id`. Return an error if the student already has a lesson in
the same ±1h exclusive window with any status in `['pending', 'confirmed']`.

**Contract**: Mirrors the instructor-overlap block exactly; only `instructor_id` is replaced
with `student_id` and the error string changes to `'Student is already booked at this time'`.
The `windowStart` and `slotEnd` variables computed in Phase 1 are reused unchanged.

### Success Criteria

#### Automated

- Phase 2 test block committed; `npm test` exits with at least 1 failure from the new
  describe block (red state)
- `npm test` exits 0 after the student-overlap guard is added
- `npm run build` exits 0
- `npm run lint` exits 0

#### Manual

- None — the integration test is the full verification for this risk

---

## Phase 3: Cookbook update

### Overview

Fill in `test-plan.md §6.2` (currently "TBD") with the server action integration test
pattern established in Phases 1 and 2.

### Changes Required

#### 1. Update `context/foundation/test-plan.md §6.2`

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD" placeholder in §6.2 with a concise description of the
server action integration test pattern, covering: test type, how to wire an authenticated
session into the server action under test, fixture approach, and how to assert both the
action return value and the DB state independently.

**Contract**: The new §6.2 content references `src/app/actions/lessons.test.ts` as the
canonical example and names the key techniques: `next/headers` cookie mock, `createServerClient`
with a mutable `sessionCookies` array, service-role client for oracle reads, and
`describe`-level isolation for each distinct scenario.

### Success Criteria

#### Automated

- `npm run build` exits 0
- `npm run lint` exits 0

#### Manual

- `test-plan.md §6.2` contains no remaining "TBD" placeholder
- The entry names `src/app/actions/lessons.test.ts` as the reference test

---

## Testing Strategy

All testing for this plan is integration-level — the tests call the real server action
against the hosted Supabase project with a real authenticated session. No mocking of DB
logic. The service-role client is used only for oracle reads (verify DB state after the
action returns) and for seed/teardown.

Unit-level tests are not warranted: the rules depend on real DB state (instructor
categories, existing lesson rows) that a mock would lie about.

## References

- Research: `context/changes/booking-integrity/research.md`
- Oracle source: `context/foundation/prd.md:98`
- Test plan risk guidance: `context/foundation/test-plan.md §2` rows #2 and #3
- Reference test pattern: `src/app/actions/lessons.test.ts`
- Instructor SELECT to modify: `src/app/actions/lessons.ts:29–34`
- Instructor overlap check to mirror: `src/app/actions/lessons.ts:43–58`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Risk #3 — Category-coherence guard (TDD)

#### Automated

- [x] 1.1 Category-coherence describe block committed; `npm test` shows ≥1 failure from it (red) — f4c22f6
- [x] 1.2 `npm test` exits 0 after guard added to `lessons.ts` — f4c22f6
- [x] 1.3 `npm run build` exits 0 — f4c22f6
- [x] 1.4 `npm run lint` exits 0 — f4c22f6

### Phase 2: Risk #2 — Student double-booking guard (TDD)

#### Automated

- [x] 2.1 Student double-booking describe block committed; `npm test` shows ≥1 failure from it (red) — f46519f
- [x] 2.2 `npm test` exits 0 after student-overlap guard added to `lessons.ts` — f46519f
- [x] 2.3 `npm run build` exits 0 — f46519f
- [x] 2.4 `npm run lint` exits 0 — f46519f

### Phase 3: Cookbook update

#### Automated

- [ ] 3.1 `npm run build` exits 0
- [ ] 3.2 `npm run lint` exits 0

#### Manual

- [ ] 3.3 `test-plan.md §6.2` no longer contains "TBD"
- [ ] 3.4 §6.2 references `src/app/actions/lessons.test.ts` as the canonical example
