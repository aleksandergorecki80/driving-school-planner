# Past Lesson Timezone Check Implementation Plan

## Overview

Fix a real, confirmed bug (reproduced live, cancelled the resulting bad lesson via service-role client during triage): the "block booking a lesson in the past" checks (TD-06) compare a naive-local-time-labeled-as-UTC `scheduled_at` against the true UTC instant (`Date.now()` / SQL `now()`), instead of against the office's actual current wall-clock time. In Poland's UTC+2 (CEST) offset, this lets a lesson up to ~2 hours in the past slip through — exactly what happened.

## Current State Analysis

- This app's date convention (confirmed via `src/lib/format-lesson-datetime.ts`'s hardcoded `timeZone: 'UTC'` formatting) is deliberate: a lesson's wall-clock time is stored as a naive value labeled UTC, so "15:30" always displays as "15:30" regardless of viewer timezone. This is a reasonable simplification for a single-location business and is NOT being changed by this plan.
- Three independent checks compare this naive-labeled value against the true current instant, not against "now, relabeled the same naive way":
  - `src/app/office/components/calendar/CalendarGrid.tsx:79` — `slotDate.getTime() < Date.now()`
  - `src/domain/lesson/Lesson.ts:49-50` — `input.scheduledAt.getTime() < Date.now()`
  - `supabase/migrations/20260901090000_book_lesson_past_scheduled_at.sql:26-28` — `IF p_scheduled_at < now() THEN`
- No timezone configuration exists anywhere in this codebase (confirmed via grep — no `TIMEZONE`/`Europe/Warsaw` reference outside today's `WeekPicker.test.ts`).
- Confirmed no other call sites duplicate this check: `createLesson.ts` and `LessonRepository.ts` only catch/map `PastScheduledAtError`/`SCHEDULED_AT_IN_PAST`, they don't independently compare dates.
- Existing tests for these three checks (`Lesson.test.ts`'s "past scheduledAt" describe block, `CalendarGrid.test.tsx`, `book-lesson.test.ts`'s `SCHEDULED_AT_IN_PAST` case) all currently pass, but two of them (`Lesson.test.ts`, `CalendarGrid.test.tsx`) rely on `vi.useFakeTimers()`/`vi.setSystemTime()` faking the *true* system clock — once the checks switch to comparing against Warsaw-relabeled time, those exact fixture values will silently assert the wrong thing (verified by hand: a fake "now" of `2050-06-15T12:00:00.000Z` in June, CEST = UTC+2, relabels to `14:00:00.000Z` for comparison purposes, which flips the existing "succeeds when scheduledAt is after now" test's fixture from future to past). These tests must be updated as part of this fix, not left as silently-wrong green checks.

## Desired End State

All three past-time checks correctly compare a lesson's naive-labeled scheduled time against the office's actual current wall-clock time (Europe/Warsaw), regardless of DST. Booking (or trying to book) a lesson that has already passed by the office's real clock is blocked everywhere — UI guard, domain invariant, and RPC — even when the true UTC instant hasn't yet reached the naive-labeled value (today's exact bug shape).

### Key Discoveries:

- `Intl.DateTimeFormat` with an explicit `timeZone` option works identically in the browser and in Node (Vercel ships full ICU) — one shared TypeScript helper can serve both `CalendarGrid.tsx` (client) and `Lesson.ts` (domain, used server-side).
- Postgres's `AT TIME ZONE` operator gives the exact SQL-side equivalent: `p_scheduled_at AT TIME ZONE 'UTC'` strips the tz label back to the original naive digits; `now() AT TIME ZONE 'Europe/Warsaw'` gives the current naive Warsaw wall-clock reading. Comparing the two naive `timestamp` values directly is correct and DST-aware (Postgres's tzdata handles the offset).
- Unlike TD-09's snap-to-Monday fix (one real caller, kept file-local), this timezone-aware "now" is needed by *two* independent TypeScript call sites (`CalendarGrid.tsx`, `Lesson.ts`) — extracting a shared `src/lib/office-time.ts` is justified here.

## What We're NOT Doing

- Not migrating the app to real UTC timestamps everywhere (display, storage, emails) — that's a much larger, unwarranted-for-this-bug change; `formatLessonDateTime`'s naive-as-UTC convention stays exactly as is.
- Not adding an `OFFICE_TIMEZONE` environment variable — `'Europe/Warsaw'` is hardcoded as a constant in TypeScript and as a literal in the SQL migration, matching this single-location app's existing lack of any per-deployment configuration.
- Not adding a grace-period/buffer to the past-check's boundary semantics — preserving the existing strict `<` (not `<=`) behavior, just fixing what "now" means.
- Not changing any user-facing error message text (`Cannot schedule a lesson in the past` stays identical) — only *when* it fires is being corrected.

## Critical Implementation Details

- **SQL migrations are append-only.** The `book_lesson` RPC fix requires a brand-new migration file with `CREATE OR REPLACE FUNCTION` reproducing the *entire* current function body (Postgres has no partial-function-edit mechanism) — only the one `IF` condition actually changes. Copy the current body from `supabase/migrations/20260901090000_book_lesson_past_scheduled_at.sql` verbatim except for that line.
- **Existing test fixtures will assert the wrong thing after the fix, silently, unless updated.** `Lesson.test.ts`'s three "past scheduledAt" tests and `CalendarGrid.test.tsx`'s NOW/day fixtures use `vi.setSystemTime()` on the *true* system clock; post-fix, "now" for comparison purposes is `officeNowAsNaiveUTC()`, which differs from the faked true clock by Warsaw's current DST offset (+1h winter, +2h summer). Rather than hand-computing DST-shifted fixture values (fragile, unreadable), these tests mock `officeNowAsNaiveUTC` directly (`vi.spyOn` on the `office-time` module's export) so the boundary-logic assertions stay decoupled from the timezone-conversion arithmetic (which gets its own dedicated test in Phase 1).

## Phase 1: Shared office-timezone "now" helper

### Overview

Add the one shared TypeScript utility both client and domain call sites will use, with its own dedicated correctness test.

### Changes Required:

#### 1. Office-timezone helper

**File**: `src/lib/office-time.ts` (new)

**Intent**: Provide "now," relabeled as if the office's real local wall-clock time were UTC — matching this app's existing naive-local-as-UTC convention — so callers get a directly-comparable `Date` without duplicating `Intl.DateTimeFormat` plumbing.

**Contract**: Export `OFFICE_TIMEZONE = 'Europe/Warsaw'` and `officeNowAsNaiveUTC(reference: Date = new Date()): Date`. Implementation uses `Intl.DateTimeFormat('en-US', { timeZone: OFFICE_TIMEZONE, year/month/day/hour/minute/second: '2-digit', hourCycle: 'h23' }).formatToParts(reference)` to extract Warsaw's current wall-clock Y/M/D/H/M/S, then returns `new Date(Date.UTC(year, month - 1, day, hour, minute, second))`. Per this project's no-`!` rule, extracting each part must use a guard block that throws a descriptive error if a expected part type is missing, not a non-null assertion. The optional `reference` parameter (defaulting to real `new Date()`) exists purely for testability — real call sites never pass it.

#### 2. Dedicated conversion test

**File**: `src/lib/office-time.test.ts` (new)

**Intent**: Prove the DST-aware conversion is correct in isolation, independent of any call site.

**Contract**: Test `officeNowAsNaiveUTC()` with an explicit `reference` argument at both a winter instant (CET, UTC+1) and a summer instant (CEST, UTC+2), asserting the returned `Date`'s UTC-getter fields equal the expected Warsaw wall-clock reading at that real instant.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Full build succeeds: `npm run build`
- New test passes: `npx vitest run src/lib/office-time.test.ts`

#### Manual Verification:

- None — pure new utility with its own automated test, not yet wired into any user-facing path.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Phase 2: Fix the calendar UI guard

### Overview

Wire `CalendarGrid`'s past-slot click guard through `officeNowAsNaiveUTC()`, and update its test to mock the helper directly.

### Changes Required:

#### 1. Use office-aware "now" in the slot guard

**File**: `src/app/office/components/calendar/CalendarGrid.tsx`

**Intent**: Block a slot as soon as it's past the office's real wall-clock time, not just past the true UTC instant.

**Contract**: Replace `Date.now()` at line 79 with `officeNowAsNaiveUTC().getTime()`, importing `officeNowAsNaiveUTC` from `@/lib/office-time`.

#### 2. Update the existing test to mock office-time

**File**: `src/app/office/components/calendar/CalendarGrid.test.tsx`

**Intent**: Keep the test asserting the intended boundary behavior (past slot blocked + toast, future slot clickable) without coupling it to real Warsaw DST arithmetic.

**Contract**: Replace the `vi.useFakeTimers()`/`vi.setSystemTime(NOW)` setup with `vi.spyOn(officeTime, 'officeNowAsNaiveUTC').mockReturnValue(NOW)` (importing `* as officeTime from '@/lib/office-time'`), keeping the same `NOW`/`day`/slot-label fixtures and assertions — only the mocking mechanism changes, not the test's intent.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Full build succeeds: `npm run build`
- `CalendarGrid.test.tsx` passes: `npx vitest run src/app/office/components/calendar/CalendarGrid.test.tsx`

#### Manual Verification:

- In the office UI, at a real moment when Warsaw local time has passed a slot but true UTC hasn't yet reached that slot's naive-labeled hour (e.g., test late in the evening, comparing a slot 1-2 hours "ago" by wall clock), the slot renders disabled and clicking it shows the "Cannot schedule a lesson in the past" toast.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Phase 3: Fix the domain invariant

### Overview

Wire `Lesson.propose()`'s past-time check through `officeNowAsNaiveUTC()`, update its three existing tests to mock the helper, and add a regression test reproducing today's exact bug shape.

### Changes Required:

#### 1. Use office-aware "now" in the domain invariant

**File**: `src/domain/lesson/Lesson.ts`

**Intent**: The domain's own safety net (independent of the UI guard, and independent of the RPC) must use the same correct comparison.

**Contract**: Replace `Date.now()` at line 50 with `officeNowAsNaiveUTC().getTime()`, importing `officeNowAsNaiveUTC` from `@/lib/office-time`.

#### 2. Update existing tests, add the regression test

**File**: `src/domain/lesson/Lesson.test.ts`

**Intent**: Keep the three existing boundary tests correct under the new semantics, and prove the domain layer now rejects exactly the shape of lesson that slipped through in production.

**Contract**: In the `describe('past scheduledAt', ...)` block, replace each test's `vi.useFakeTimers()`/`vi.setSystemTime(...)` with `vi.spyOn(officeTime, 'officeNowAsNaiveUTC').mockReturnValue(<the same fixture Date each test already used as "now">)` (importing `* as officeTime from '@/lib/office-time'`) — same fixture values, same assertions, just mocking the helper instead of the system clock. Add a new test: mock `officeNowAsNaiveUTC` to return a Warsaw-relabeled "now" 2 hours ahead of a `scheduledAt` that is itself still in the true future relative to the *unmocked* real clock (mirroring the production bug: `scheduledAt` is UTC-future but Warsaw-wall-clock-past) — assert it throws `PastScheduledAtError`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Full build succeeds: `npm run build`
- `Lesson.test.ts` passes: `npx vitest run src/domain/lesson/Lesson.test.ts`

#### Manual Verification:

- None beyond Phase 2's manual check — the domain invariant is exercised indirectly through the same booking flow; no separate manual path.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Phase 4: Fix the RPC (server-side, bypasses the TypeScript layer)

### Overview

Fix `book_lesson`'s past-time check at the same authoritative layer as the domain invariant (this RPC is `SECURITY DEFINER` and independently callable, so it must enforce this on its own), and add a regression test against the real hosted Supabase instance reproducing today's exact bug shape.

### Changes Required:

#### 1. New migration fixing the RPC's past-time check

**File**: `supabase/migrations/<timestamp>_book_lesson_office_timezone_past_check.sql` (new; use `date +%Y%m%d%H%M%S` for `<timestamp>`)

**Intent**: Compare `p_scheduled_at`'s naive-labeled value against the office's real current Warsaw wall-clock time, not the true UTC instant — the SQL-side equivalent of Phases 1-3's fix.

**Contract**: `CREATE OR REPLACE FUNCTION book_lesson(...)` reproducing the full existing function body from `supabase/migrations/20260901090000_book_lesson_past_scheduled_at.sql` verbatim, except the past-check condition changes from `IF p_scheduled_at < now() THEN` to `IF (p_scheduled_at AT TIME ZONE 'UTC') < (now() AT TIME ZONE 'Europe/Warsaw') THEN`:

```sql
IF (p_scheduled_at AT TIME ZONE 'UTC') < (now() AT TIME ZONE 'Europe/Warsaw') THEN
  RETURN QUERY SELECT false, 'SCHEDULED_AT_IN_PAST', NULL::uuid, NULL::uuid; RETURN;
END IF;
```

Add a one-line SQL comment above the function noting the coupling to `src/lib/office-time.ts`'s `OFFICE_TIMEZONE` constant, so a future timezone change updates both.

#### 2. Regression test against the real bug shape

**File**: `src/lib/supabase/book-lesson.test.ts`

**Intent**: Prove the RPC itself (independent of the TypeScript layer, since it's directly callable) rejects a `scheduled_at` that is true-UTC-future but Warsaw-wall-clock-past — exactly the row that was created in production.

**Contract**: Add a new `it(...)` alongside the existing `SCHEDULED_AT_IN_PAST` test. Compute the current real Warsaw wall-clock reading via `officeNowAsNaiveUTC()` (imported from `@/lib/office-time` — reused here as a test utility, not re-implemented), subtract a few minutes, format as an ISO string, and pass it as `p_scheduled_at`. Assert `error_code === 'SCHEDULED_AT_IN_PAST'` and no row inserted, matching the existing test's assertion shape (lines 126-135).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Full build succeeds: `npm run build`
- Migration applies cleanly against the linked Supabase project (via whatever mechanism prior migrations in this repo use — check for a `supabase db push`/CI step; if none is documented, apply via the Supabase dashboard SQL editor or CLI and note it in Progress)
- `book-lesson.test.ts` passes: `npx vitest run src/lib/supabase/book-lesson.test.ts`
- Full test suite still passes: `npm test`

#### Manual Verification:

- Repeat the exact production repro: with real Warsaw local time past a slot's naive-labeled hour but true UTC not yet there, attempt to book that slot end-to-end (open New Lesson panel, click Book lesson) — confirm it's now rejected with the "Cannot schedule a lesson in the past" message, not created.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- `office-time.test.ts`: DST-aware conversion correctness at winter and summer instants.
- `Lesson.test.ts`: existing 3 boundary tests re-mocked against `officeNowAsNaiveUTC`; 1 new regression test for the exact bug shape.
- `CalendarGrid.test.tsx`: existing test re-mocked against `officeNowAsNaiveUTC`, same assertions.

### Integration Tests:

- `book-lesson.test.ts`: 1 new regression test against the real hosted Supabase instance, reproducing the exact bug shape via a `scheduled_at` computed relative to the real current Warsaw wall-clock time.

### Manual Testing Steps:

1. Wait for (or pick) a real moment when Warsaw local time has passed a calendar slot's labeled hour by 30-90 minutes, but true UTC hasn't yet reached that hour.
2. In `/office`, confirm that slot renders disabled with the past-slot toast on click (Phase 2).
3. Attempt the full booking flow anyway (if reachable via URL manipulation or a stale open panel) and confirm the server rejects it with "Cannot schedule a lesson in the past" (Phases 3-4).

## Performance Considerations

None — `Intl.DateTimeFormat` construction is cheap and already used elsewhere in this app's date formatting; no additional data fetching.

## Migration Notes

The new SQL migration only changes a comparison condition inside an existing function — no schema change, no backfill needed. The one bad row this bug produced in the live database was already cancelled manually during triage (2026-09-05) via a service-role client, mirroring `cancelLesson`'s existing update pattern (`status: 'cancelled', token: null`).

## References

- Roadmap/GitHub: not yet tracked as a roadmap item — this is a hotfix for TD-06 found via live bug report, not a pre-existing backlog entry.
- Original feature this fixes: `context/changes/no-past-lesson-scheduling/plan.md` (TD-06)
- Existing pattern for `Intl`-based UTC-boundary math: `src/app/office/components/calendar/WeekPicker.tsx`'s `toLocalMidnight`/`toUTCMidnight` (TD-09, today)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared office-timezone "now" helper

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — 894a621
- [x] 1.2 Linting passes: `npm run lint` — 894a621
- [x] 1.3 Full build succeeds: `npm run build` — 894a621
- [x] 1.4 New test passes: `npx vitest run src/lib/office-time.test.ts` — 894a621

### Phase 2: Fix the calendar UI guard

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 36acdb4
- [x] 2.2 Linting passes: `npm run lint` — 36acdb4
- [x] 2.3 Full build succeeds: `npm run build` — 36acdb4
- [x] 2.4 CalendarGrid.test.tsx passes: `npx vitest run src/app/office/components/calendar/CalendarGrid.test.tsx` — 36acdb4

#### Manual

- [x] 2.5 A wall-clock-past, UTC-future slot renders disabled with the past-slot toast — 36acdb4

### Phase 3: Fix the domain invariant

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — dfdc603
- [x] 3.2 Linting passes: `npm run lint` — dfdc603
- [x] 3.3 Full build succeeds: `npm run build` — dfdc603
- [x] 3.4 Lesson.test.ts passes: `npx vitest run src/domain/lesson/Lesson.test.ts` — dfdc603

### Phase 4: Fix the RPC

#### Automated

- [x] 4.1 Type checking passes: `npm run typecheck` — 09f4bbb
- [x] 4.2 Linting passes: `npm run lint` — 09f4bbb
- [x] 4.3 Full build succeeds: `npm run build` — 09f4bbb
- [x] 4.4 Migration applies cleanly — 09f4bbb
- [x] 4.5 book-lesson.test.ts passes: `npx vitest run src/lib/supabase/book-lesson.test.ts` — 09f4bbb
- [x] 4.6 Full test suite passes: `npm test` — 09f4bbb

#### Manual

- [x] 4.7 Full booking flow rejects a wall-clock-past, UTC-future lesson end-to-end — 09f4bbb
