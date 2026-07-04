---
date: 2026-07-04T00:00:00+02:00
researcher: claude-sonnet-4-6
git_commit: 5dcb4465ec5b7e5e26d1d65e15a88bcce40299ac
branch: main
repository: driving-school-planner
topic: "Booking integrity — category-coherence (Risk #3) and student double-booking (Risk #2)"
tags: [research, booking, category-coherence, double-booking, server-actions, integration-tests]
status: complete
last_updated: 2026-07-04
last_updated_by: claude-sonnet-4-6
---

# Research: Booking integrity — category-coherence and double-booking

**Date**: 2026-07-04  
**Git Commit**: 5dcb4465ec5b7e5e26d1d65e15a88bcce40299ac  
**Branch**: main  

## Research Question

What does the server action `createLesson` currently validate regarding category-coherence
(Risk #3) and student double-booking (Risk #2), and what is the oracle for what it *should* do?

---

## Summary

**Risk #3 (category-coherence)** is an implementation gap, not just a test gap.
`createLesson` does not re-validate that the instructor holds the submitted category.
The oracle is unambiguous in the PRD. The fix is a one-query guard in the server action;
the test proves the server rejects a mismatched pairing regardless of what the UI submitted.

**Risk #2 (student double-booking)** is a partial test gap.
The instructor conflict check exists and is tested. The student conflict check does not exist
in the implementation and is not tested.

---

## Detailed Findings

### A. Oracle — what the code MUST do (Risk #3)

**Source**: `context/foundation/prd.md:98`
> "A lesson can only be created when the selected instructor holds the licence category of that lesson."

**Source**: `context/foundation/test-plan.md` Risk Response Guidance row #3:
> "What would prove protection: A server-side lesson creation call supplying a mismatched
> instructor/category is rejected, regardless of what the UI submitted."
>
> "Must challenge: 'The dropdown only shows valid instructors' ≠ 'the server re-validates
> the instructor's categories before writing' — the client can submit anything."

The oracle is fully determined from sources. No guessing required.

### B. Current implementation — what `createLesson` actually does

**File**: `src/app/actions/lessons.ts`

| Step | Lines | What it checks |
|------|-------|----------------|
| 1 | 12–15 | `scheduledAt` is a valid ISO timestamp |
| 2 | 24–25 | Authenticated office user |
| 3 | 29–34 | Instructor row exists (by `id`) — SELECT `id` only |
| 4 | 36–41 | Student row exists (by `id`) |
| 5 | 43–58 | No overlapping lesson for this **instructor** in a ±1h window |
| 6 | 60–66 | INSERT with `category` value from the caller |

**Gap — Risk #3**: Step 3 selects only `id` from the instructor row. It does not fetch
`categories` and does not assert `category ∈ instructor.categories`. Any category string
is accepted at write time.

**Gap — Risk #2 (student side)**: Step 5 filters only by `instructor_id`. The same
student can be booked into two simultaneous lessons with different instructors; no
student-overlap check exists.

### C. Schema

**File**: `supabase/migrations/20260614143835_initial_schema.sql`

- `instructors.categories  text[]  NOT NULL` — array of category strings
- `lessons.category        text    NOT NULL` — single category string for the lesson
- No DB-level CHECK constraint linking the two. Explicitly deferred to the application
  layer in `context/changes/supabase-data-foundation/plan.md:50`:
  > "No DB-level category-coherence constraint (application-enforced via UI filtering in S-01)"

No RLS policy references the `category` column. The `get_instructor_lessons` function
(`supabase/migrations/20260627000003_fix_security_definer_explicit_columns.sql:6–36`)
returns the `category` column but does not filter on it.

### D. UI filtering — why it is insufficient as the only guard

**File**: `src/app/office/page.tsx:34–37`
```typescript
const { data: instructors } = await db
  .from('instructors')
  .select('id, name, categories')
  .order('name')
// category filtering happens client-side in the sidebar
```

All instructors are returned to the browser. The filter is applied in JavaScript:

**File**: `src/app/office/InstructorSidebar.tsx:35–38`
```typescript
const visibleInstructors = selectedCategory
  ? instructors.filter((i) => i.categories.includes(selectedCategory))
  : instructors
```

A direct call to `createLesson` (via `fetch`, Playwright script, or a modified client)
bypasses this filter entirely. The server action trusts whatever `instructorId` and
`category` are submitted.

### E. Seed data for tests

**File**: `src/lib/supabase/test-client.ts:39`
```typescript
categories: overrides.categories ?? ['B'],
```
`seedInstructor` defaults to `['B']`. Tests can pass `{ categories: ['C'] }` to create
an instructor who does NOT hold category 'B', enabling a mismatched-pairing scenario.

**File**: `supabase/seed.sql` (production seed):
```
Jan Kowalski      → ['B']
Anna Nowak        → ['B', 'C']
Piotr Wiśniewski  → ['C', 'D', 'C+E']
Maria Dąbrowska   → ['B', 'T']
Tomasz Zając      → ['B+E', 'C+E']
```

### F. Prior decisions

- DB-level constraint explicitly out of scope for F-01
  (`context/changes/supabase-data-foundation/plan-brief.md` "Out of scope" section).
- S-01 (`office-books-lesson`) archived without adding server-side category validation;
  category enforcement was left to UI filtering only.
- Test-plan §3 Phase 2 "Booking integrity" is the designated phase for both Risk #2 and
  Risk #3. Status: `not started`.

---

## Code References

- `src/app/actions/lessons.ts:29–34` — instructor existence check (only `id`, no categories)
- `src/app/actions/lessons.ts:60–66` — lesson insert (category value unchecked)
- `src/app/office/InstructorSidebar.tsx:35–38` — client-side category filter
- `src/app/office/page.tsx:34–37` — server fetches all instructors, no WHERE on category
- `src/lib/supabase/test-client.ts:39` — `seedInstructor` default categories `['B']`
- `supabase/migrations/20260614143835_initial_schema.sql` — schema definitions
- `context/foundation/prd.md:98` — canonical oracle for category-coherence rule

---

## Architecture Insights

The system has a layered defence model that is currently missing its server layer:

```
UI layer (client-side JS filter)  ←  present
Server action validation           ←  MISSING for category-coherence and student overlap
DB constraints                     ←  intentionally absent (deferred)
```

The fix for Risk #3 is minimal: change the instructor SELECT from `select('id')` to
`select('id, categories')`, then add:
```typescript
if (!instructor.categories.includes(category)) {
  return { error: 'Instructor does not hold this category' }
}
```

This is a one-query, one-guard change. No schema migration needed.

---

## What the integration test must prove (oracle)

### Risk #3 — category-coherence

```
GIVEN instructor seeded with categories: ['C']
AND   office session authenticated
WHEN  createLesson called with instructorId=<that instructor> and category='B'
THEN  result.error === 'Instructor does not hold this category'
AND   no row inserted in lessons table
```

Anti-pattern to avoid: asserting the UI dropdown only shows valid instructors —
that is a UI test, not the server-layer oracle.

### Risk #2 — student double-booking (server side)

```
GIVEN instructor A and instructor B, both seeded with categories: ['B']
AND   student S seeded
AND   first lesson created: instructorA + studentS + scheduledAt=T (succeeds)
WHEN  createLesson called with instructorB + studentS + scheduledAt=T
THEN  result.error === 'Student is already booked at this time'
AND   no second row inserted
```

Note: this requires both a new guard in `createLesson` AND a new test. The current
implementation has no student-overlap check at all.

---

## Open Questions

None. The oracle for both risks is fully determined from the PRD and test-plan sources.
Implementation path is clear; no ambiguity to resolve before planning.
