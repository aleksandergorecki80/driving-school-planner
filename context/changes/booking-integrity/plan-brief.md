# Booking Integrity — Plan Brief

> Full plan: `context/changes/booking-integrity/plan.md`
> Research: `context/changes/booking-integrity/research.md`

## What & Why

Add two missing server-side guards to `createLesson` that the PRD requires but that were
left client-side only after S-01 shipped. Without them, a direct server action call — bypassing
the UI dropdowns — can create a lesson with a mismatched category or double-book the same
student simultaneously.

## Starting Point

`createLesson` (`src/app/actions/lessons.ts`) already blocks instructor double-booking via
an overlap query. Category filtering and student conflict prevention exist only in client-side
JavaScript and are bypassed by any direct API call.

## Desired End State

`createLesson` rejects invalid calls at the server layer regardless of what the client
submitted: wrong category for the instructor (`'Instructor does not hold this category'`),
or student already booked in the window (`'Student is already booked at this time'`).
Integration tests prove both rejections against the real DB. `test-plan.md §6.2` documents
the server action integration test pattern for future phases.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Implementation mode | TDD (test-first) | Writing the test before the guard proves the test is real and not vacuous — critical for Risk #3 which was silently passing | Plan |
| Category check placement | After instructor null-check, before student check | Categories are fetched in the same instructor query; checking immediately avoids an unnecessary student query on invalid input | Plan |
| Student overlap window | Same ±1h exclusive window as instructor check | Lessons are 1 hour; the same overlap logic applies to student conflicts | Research |
| Scope | Risk #3 + Risk #2 only | `cancelLesson` edge cases are a separate concern not covered by test-plan Phase 2 | Plan |
| Test layer | Integration (real DB, real session) | Rules depend on actual DB state — a mock would lie about array membership and existing rows | Research / test-plan §2 |

## Scope

**In scope:**
- Category-coherence guard in `createLesson` (Risk #3)
- Student double-booking guard in `createLesson` (Risk #2)
- Integration tests for both guards (TDD order)
- `test-plan.md §6.2` cookbook entry

**Out of scope:**
- DB-level category constraint (intentionally absent — deferred in F-01)
- `cancelLesson` edge case tests
- UI changes
- Any change to `cancelLesson`

## Architecture / Approach

Two minimal changes to `lessons.ts`, sequenced so the category guard comes first (Phase 1)
and the student-overlap guard second (Phase 2). Each phase is a complete TDD cycle:
write the failing test → confirm red → add guard → confirm green. Phase 3 updates the
cookbook once both guards are proven.

```
lessons.ts (current):     auth → instructor exists → student exists → instructor overlap → INSERT
lessons.ts (after plan):  auth → instructor exists + categories → category guard
                               → student exists → instructor overlap → student overlap → INSERT
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Category-coherence guard (TDD) | `createLesson` rejects mismatched category; test proves it | Test passes vacuously if written after the guard — TDD order prevents this |
| 2. Student double-booking guard (TDD) | `createLesson` rejects student conflicts; test proves it | Same anti-pattern risk as Phase 1 — TDD order prevents it |
| 3. Cookbook update | `test-plan.md §6.2` filled in with server action pattern | None |

**Prerequisites:** `.env.test` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OFFICE_EMAIL`, `OFFICE_PASSWORD` — already present from Phase 1 of `testing-auth-access-boundaries`.  
**Estimated effort:** ~1 session across 3 phases (changes are contained to 1 file + 1 test file + 1 doc file)

## Open Risks & Assumptions

- None. Oracle is unambiguous (PRD line 98). Implementation path is clear from existing patterns.

## Success Criteria (Summary)

- `npm test` exits 0 with all new and existing tests passing
- A direct `createLesson` call with a mismatched category returns an error
- A direct `createLesson` call booking an already-committed student returns an error
