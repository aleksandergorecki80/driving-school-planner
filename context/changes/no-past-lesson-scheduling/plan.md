# Block Booking a Lesson in the Past — Implementation Plan

## Overview

Office staff can currently book a lesson at any `scheduled_at`, including a time that has already passed — neither the domain layer, the DB, nor the calendar UI reject it. This plan closes that gap end-to-end: a domain invariant in `Lesson.propose()`, a mirrored authoritative check in the `book_lesson` RPC, and a click-level guard on the office calendar grid that makes past slots unclickable.

## Current State Analysis

- `Lesson.propose()` (`src/domain/lesson/Lesson.ts:37-50`) validates instructor/student category coherence but performs no check on `scheduledAt` at all.
- `book_lesson` (`supabase/migrations/20260829120000_book_lesson_invariants.sql`) is the sole authoritative write path — `SECURITY DEFINER`, `GRANT EXECUTE ... TO authenticated` — so it is callable directly by any authenticated session, bypassing `Lesson.propose()`. TD-01 established the pattern of mirroring every domain invariant here (category checks, `EXCLUDE` overlap constraints) rather than trusting the TypeScript layer alone.
- `LessonRepository.save()` (`src/domain/lesson/LessonRepository.ts`) maps `book_lesson`'s `error_code` back to typed domain errors; `createLesson.ts`'s `mapDomainErrorToMessage()` maps those to the strings the office UI displays.
- `CalendarGrid.tsx` (`src/app/office/components/calendar/CalendarGrid.tsx:58-73`) renders one clickable `<div onClick={() => onSlotClick(slotDate)}>` per slot cell for every visible day/time combination, with no time check. `WeeklyCalendar.tsx` lets office staff navigate to any week, past or future — that stays as-is; only the per-slot click is being gated.
- All datetime handling in this app is UTC-based (`toISOString()`, `getUTCHours()`, `getUTCDay()`), so "is this slot in the past" is a plain `Date` comparison — no timezone conversion is involved anywhere in this plan.
- There are currently **zero React component tests** in this repository: `vitest.config.ts` sets `environment: 'node'` and `include: ['src/**/*.test.ts']` (`.ts` only), and neither `@testing-library/react` nor `jsdom` is installed. Testing the UI guard requires introducing both, scoped to the one new test file via a per-file `@vitest-environment jsdom` docblock so the rest of the suite (which hits a real dev server + Supabase) is unaffected.

## Desired End State

- Calling `Lesson.propose()` with a `scheduledAt` strictly before the current moment throws `PastScheduledAtError`.
- Calling the `book_lesson` RPC directly (bypassing the app) with a past `p_scheduled_at` returns `{ ok: false, error_code: 'SCHEDULED_AT_IN_PAST' }` and inserts nothing.
- `createLesson()` returns `{ error: 'Cannot schedule a lesson in the past' }` when given a past `scheduledAt`, without any DB row being created.
- In the office calendar, any grid slot whose time has already passed is visually disabled and does not open the "New Lesson" panel when clicked; slots at or after the current moment are unaffected. Week navigation is unchanged — staff can still browse past weeks to review history.

### Key Discoveries:

- `book_lesson`'s existing error-code idiom (`INSTRUCTOR_CATEGORY_MISMATCH`, `SLOT_UNAVAILABLE_INSTRUCTOR`, …) is a `RETURN QUERY SELECT false, '<CODE>', NULL::uuid, NULL::uuid; RETURN;` guard clause near the top of the function, before the `INSERT` — the new check slots in the same way (`supabase/migrations/20260829120000_book_lesson_invariants.sql:54-71`).
- `LessonRepository.save()`'s `switch (row?.error_code)` (`src/domain/lesson/LessonRepository.ts:46-61`) is the single place DB error codes become typed errors — add one `case` there.
- `createLesson.ts`'s `mapDomainErrorToMessage()` (`src/app/actions/lessons/createLesson.ts:16-26`) is the single place domain errors become office-facing strings — add one `if` there, following the existing byte-for-byte-preserved-string convention from TD-01.
- Migrations are applied via `npx supabase db push` against the hosted project (no local Docker stack) — confirmed in `context/changes/supabase-data-foundation/plan.md` and `testing-auth-access-boundaries/plan.md`.
- The design system already has an established disabled-state convention (`aria-disabled:pointer-events-none aria-disabled:opacity-50`, seen in `src/components/ui/select.tsx`, `src/components/ui/sidebar.tsx`) — reuse it rather than inventing new classes.

## What We're NOT Doing

- Not blocking `WeeklyCalendar`'s week navigation — office staff can still browse past weeks to review lesson history, per explicit user direction.
- Not adding a minimum lead-time buffer (e.g. "must book at least 30 minutes ahead") — only a strict `scheduledAt < now` check, matching the issue's stated scope.
- Not adding a table-level `CHECK` constraint on `lessons.scheduled_at` — a `now()`-based `CHECK` is re-evaluated on every `UPDATE`, which would retroactively break `respond_to_lesson`/`cancelLesson` on any lesson whose scheduled time has since passed. The RPC-level guard-on-insert is correct here precisely because it only ever fires once, at booking time.
- Not touching existing past-dated lesson rows — the new checks apply to inserts only; historical/completed lessons are unaffected.
- Not adding a global testing-library/jsdom environment change — scoped to the one new test file via a per-file environment docblock.
- Not writing a Playwright E2E test for this — covered by a real component test instead (see Test scope decision).

## Implementation Approach

Bottom-up: domain invariant first (pure, fast, easiest to get right in isolation), then its DB mirror (the authoritative gate, following the exact TD-01 pattern), then the server-action wiring that surfaces it as a message, then the UI click-guard on top. Each phase is independently testable and shippable.

## Phase 1: Domain invariant — `Lesson.propose()`

### Overview

`Lesson.propose()` gains a new invariant: reject a `scheduledAt` strictly before the current moment.

### Changes Required:

#### 1. `src/domain/lesson/Lesson.ts`

**Intent**: Add a `PastScheduledAtError` and check `scheduledAt` against the current time inside `propose()`, alongside the existing category checks.

**Contract**: New exported class `PastScheduledAtError extends Error`, constructed with the offending `scheduledAt: Date`, message e.g. `` `Cannot schedule a lesson in the past: ${scheduledAt.toISOString()}` ``. `propose()` throws it when `input.scheduledAt.getTime() < Date.now()`, checked before the existing category checks (ordering doesn't matter functionally since all three are independent guard clauses, but checking it first avoids doing category lookups' surrounding work in the caller for a request that's invalid regardless — no code impact, just where the `if` sits).

#### 2. `src/domain/lesson/Lesson.test.ts`

**Intent**: Cover the new invariant with deterministic boundary tests.

**Contract**: Use `vi.useFakeTimers()` / `vi.setSystemTime(...)` (from `vitest`) to fix "now" for these tests only, restoring real timers in `afterEach`. Cases: throws `PastScheduledAtError` for a `scheduledAt` before the fixed "now"; succeeds for a `scheduledAt` exactly equal to "now" or later (boundary is inclusive-of-now, i.e. only strictly-past times are rejected).

### Success Criteria:

#### Automated Verification:

- `npm run test -- src/domain/lesson/Lesson.test.ts` passes, including the new past-time cases
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- N/A — pure domain logic, fully covered by the automated unit tests above.

---

## Phase 2: DB RPC mirror — `book_lesson`

### Overview

Mirror the same invariant inside the `book_lesson` Postgres function so a past `scheduled_at` is rejected even when the RPC is called directly, closing the same bypass TD-01 closed for the category and overlap invariants.

### Changes Required:

#### 1. `supabase/migrations/20260901090000_book_lesson_past_scheduled_at.sql`

**Intent**: Add a `p_scheduled_at < now()` guard clause to `book_lesson`, returning a new `error_code`, before the existing category checks (rejecting on the cheapest condition first avoids unnecessary lookups for an already-invalid request).

**Contract**: `CREATE OR REPLACE FUNCTION book_lesson(...)` (same signature) with one new guard clause following the existing idiom exactly:
```sql
IF p_scheduled_at < now() THEN
  RETURN QUERY SELECT false, 'SCHEDULED_AT_IN_PAST', NULL::uuid, NULL::uuid; RETURN;
END IF;
```
placed as the first check in the function body, before the instructor/student lookups.

#### 2. `src/domain/lesson/LessonRepository.ts`

**Intent**: Map the new `error_code` to the domain error from Phase 1.

**Contract**: Add `case 'SCHEDULED_AT_IN_PAST': throw new PastScheduledAtError(lesson.scheduledAt)` to the `switch` in `save()`, importing `PastScheduledAtError` from `./Lesson`.

#### 3. `src/lib/supabase/book-lesson.test.ts`

**Intent**: Cover the RPC-level rejection directly (bypassing `Lesson.propose()`, as a direct caller would).

**Contract**: New test asserting `office.rpc('book_lesson', { ..., p_scheduled_at: '<a timestamp before now>' })` returns `{ ok: false, error_code: 'SCHEDULED_AT_IN_PAST', lesson_id: null }` and inserts no row (oracle query, matching the existing test file's pattern).

### Success Criteria:

#### Automated Verification:

- `npx supabase db push` exits with code 0 (migration applies cleanly)
- `npm run test -- src/lib/supabase/book-lesson.test.ts` passes, including the new past-time case
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- N/A — fully covered by the RPC-level automated test above.

---

## Phase 3: Server action wiring — `createLesson`

### Overview

Surface `PastScheduledAtError` as an office-facing error message through the existing `createLesson()` path.

### Changes Required:

#### 1. `src/app/actions/lessons/createLesson.ts`

**Intent**: Map the new domain error to a user-facing string, following the exact pattern of the other `if (err instanceof ...)` branches already in `mapDomainErrorToMessage()`.

**Contract**: Import `PastScheduledAtError` from `@/domain/lesson/Lesson`; add `if (err instanceof PastScheduledAtError) return 'Cannot schedule a lesson in the past'` to `mapDomainErrorToMessage()`.

#### 2. `src/app/actions/lessons.test.ts`

**Intent**: Cover the full path from `createLesson()` call to rejected result, and confirm no row is inserted.

**Contract**: New test in the `describe('createLesson', ...)` block: call `createLesson({ ..., scheduledAt: '<a timestamp before now>' })`, assert `result.error === 'Cannot schedule a lesson in the past'`, and assert (oracle query, matching the file's existing convention) that no matching row exists in `lessons`.

### Success Criteria:

#### Automated Verification:

- `npm run test -- src/app/actions/lessons.test.ts` passes in full (all pre-existing + new tests)
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- N/A — fully covered by the server-action-level automated test above.

---

## Phase 4: UI click-guard — office calendar grid

### Overview

Make past-time slots visually disabled and unclickable in `CalendarGrid`, and add the component-test infrastructure needed to cover it.

### Changes Required:

#### 1. `package.json` (devDependencies)

**Intent**: Add `@testing-library/react` and `jsdom` as devDependencies — the only new test infra this plan introduces, scoped to one test file.

**Contract**: `npm install --save-dev @testing-library/react jsdom`.

#### 2. `src/app/office/components/calendar/CalendarGrid.tsx`

**Intent**: Compute whether each rendered slot's `slotDate` is in the past and, if so, render it as disabled (no `onSlotClick` call, visually muted) instead of clickable.

**Contract**: For each slot cell, derive `isPast = slotDate.getTime() < Date.now()`. When `isPast`, set `aria-disabled="true"`, apply the existing design-system disabled classes (`aria-disabled:pointer-events-none aria-disabled:opacity-50`, matching `select.tsx`/`sidebar.tsx`), and guard the click handler itself (`onClick={isPast ? undefined : () => onSlotClick(slotDate)}`) so a stray click can never fire even if a class fails to apply. `Date.now()` is read once per render (not memoized across re-renders) — acceptable staleness for a UI convenience guard, since the domain/RPC layers from Phases 1–2 are the actual source of truth if a click ever slips through on a long-open tab.

#### 3. `src/app/office/components/calendar/CalendarGrid.test.tsx` (new file)

**Intent**: Render `CalendarGrid` with a fixed "now" and assert a past slot is disabled/unclickable while a future slot is not.

**Contract**: File-level `// @vitest-environment jsdom` docblock at the top (scopes jsdom to this file only, per the vitest per-file environment override mechanism — does not change the global `vitest.config.ts`). Use `vi.setSystemTime(...)` to fix "now" to a known instant, render `CalendarGrid` via `@testing-library/react`'s `render()` with `days` spanning that instant, click a past slot and a future slot, and assert `onSlotClick` was called only for the future one.

### Success Criteria:

#### Automated Verification:

- Full test suite passes: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- In the running app (`npm run dev`), open `/office`, navigate to the current week, and confirm: slots earlier than the current time today are visually muted and clicking them does nothing; slots later today and on future days remain clickable and open the New Lesson panel as before.
- Navigate to a past week and confirm all its slots are muted/unclickable, while existing lesson blocks in that week still render and remain clickable (lesson-block clicks are a separate handler, unaffected by this change).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `Lesson.propose()` rejects/accepts around the past-time boundary (Phase 1).
- `CalendarGrid` disables past slots, leaves future ones clickable (Phase 4).

### Integration Tests:

- `book_lesson` RPC rejects a past `p_scheduled_at` directly, bypassing the app layer (Phase 2).
- `createLesson()` end-to-end rejects a past `scheduledAt` with the right message and inserts nothing (Phase 3).

### Manual Testing Steps:

1. In `/office`, confirm past slots in the current week are muted and unclickable.
2. Confirm future slots (later today, future days/weeks) remain clickable and bookable end-to-end.
3. Confirm browsing to a past week still works (no navigation restriction) and past lesson blocks still render/click normally.

## Performance Considerations

None — all checks are simple `Date`/timestamp comparisons with no added queries or network calls.

## Migration Notes

Additive-only migration (new `error_code` branch in an existing `CREATE OR REPLACE FUNCTION`); no data migration needed since the new check only ever fires on `INSERT` for new bookings, never against existing rows.

## References

- Related prior work: `context/changes/lesson-category-invariant/plan.md` (TD-01 — the pattern this plan mirrors)
- Roadmap entry: `context/foundation/roadmap.md` TD-06
- `src/domain/lesson/Lesson.ts:37-50`
- `supabase/migrations/20260829120000_book_lesson_invariants.sql:37-94`
- `src/domain/lesson/LessonRepository.ts:32-68`
- `src/app/actions/lessons/createLesson.ts:16-26`
- `src/app/office/components/calendar/CalendarGrid.tsx:58-73`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Domain invariant — Lesson.propose()

#### Automated

- [x] 1.1 `npm run test -- src/domain/lesson/Lesson.test.ts` passes, including the new past-time cases
- [x] 1.2 Type checking passes: `npm run typecheck`
- [x] 1.3 Linting passes: `npm run lint`

### Phase 2: DB RPC mirror — book_lesson

#### Automated

- [ ] 2.1 `npx supabase db push` exits with code 0 (migration applies cleanly)
- [ ] 2.2 `npm run test -- src/lib/supabase/book-lesson.test.ts` passes, including the new past-time case
- [ ] 2.3 Type checking passes: `npm run typecheck`
- [ ] 2.4 Linting passes: `npm run lint`

### Phase 3: Server action wiring — createLesson

#### Automated

- [ ] 3.1 `npm run test -- src/app/actions/lessons.test.ts` passes in full (all pre-existing + new tests)
- [ ] 3.2 Type checking passes: `npm run typecheck`
- [ ] 3.3 Linting passes: `npm run lint`

### Phase 4: UI click-guard — office calendar grid

#### Automated

- [ ] 4.1 Full test suite passes: `npm run test`
- [ ] 4.2 Type checking passes: `npm run typecheck`
- [ ] 4.3 Linting passes: `npm run lint`

#### Manual

- [ ] 4.4 Past slots in the current week are visually muted and unclickable in `/office`; future slots remain clickable and bookable
- [ ] 4.5 Browsing to a past week still works, with past lesson blocks still rendering and clickable
