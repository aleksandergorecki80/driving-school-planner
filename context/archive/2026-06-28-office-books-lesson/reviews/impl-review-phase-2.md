<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Office Books Lesson (S-01) — Phase 2

- **Plan**: context/changes/office-books-lesson/plan.md
- **Scope**: Phase 2 of 6
- **Date**: 2026-06-28
- **Verdict**: APPROVED (all findings resolved during triage)
- **Findings**: 0 critical  4 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING → FIXED |
| Architecture | PASS |
| Pattern Consistency | WARNING → FIXED |
| Success Criteria | PASS |

## Findings

### F1 — No application-layer auth guard in either server action

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/actions/lessons.ts:22, 55
- **Detail**: Neither createLesson nor cancelLesson called db.auth.getUser(). RLS was the only guard; would break when multi-role auth arrives.
- **Fix Applied**: Added `const { data: { user } } = await db.auth.getUser(); if (!user) return { error: 'Unauthorized' }` at the top of each action.
- **Decision**: FIXED via Fix A

### F2 — TOCTOU race: overlap check and INSERT are not atomic

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/app/actions/lessons.ts:24–46
- **Detail**: Conflict SELECT and INSERT were two separate DB round-trips; concurrent requests could both pass and produce a double-booking.
- **Fix Applied**: Added migration `20260628000002_add_unique_lesson_slot_index.sql` — partial unique index on `(instructor_id, scheduled_at) WHERE status IN ('pending','confirmed')`.
- **Decision**: FIXED via Fix B

### F3 — cancelLesson returns {} even when lessonId matches no row

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/actions/lessons.ts:58–65
- **Detail**: Blind update succeeded silently with 0 rows affected.
- **Fix Applied**: Chained `.select('id').single()` after update; returns `{ error: 'Lesson not found or already cancelled' }` when data is null.
- **Decision**: FIXED

### F4 — Fragile afterEach cleanup mutates shared array in place

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/app/actions/lessons.test.ts:80–91
- **Detail**: Splice-based partial removal of lesson rows from a shared cleanup array was fragile.
- **Fix Applied**: Introduced separate `lessonIds: string[]` array cleared wholesale in afterEach; `suiteCleanup` retains instructor/student only.
- **Decision**: FIXED via Fix A (also resolved F6 — duplicate import removed)

### F5 — No .limit(1) on the conflict-check query

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/actions/lessons.ts:24
- **Detail**: Retrieved all overlapping rows when only existence was needed.
- **Fix Applied**: Appended `.limit(1)` to the conflict-check query chain.
- **Decision**: FIXED

### F6 — Duplicate afterAll import

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/actions/lessons.test.ts:94
- **Detail**: `import { afterAll } from 'vitest'` appeared twice.
- **Decision**: FIXED (resolved as part of F4 test refactor)

### F7 — createLesson does not verify instructor/student are active

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/actions/lessons.ts:10
- **Detail**: No existence check for instructor/student before INSERT. lessons.md rule requires filtering deactivated_at IS NULL on active-record queries. Column not yet in schema; guard added as plain existence check with TODO comment to add deactivated_at filter when column is migrated.
- **Fix Applied**: Added `.select('id').eq('id', …).single()` guards for both instructor and student; returns descriptive errors; comment notes deactivated_at filter to add when schema adds the column.
- **Decision**: FIXED
