# Block Booking a Lesson in the Past — Plan Brief

> Full plan: `context/changes/no-past-lesson-scheduling/plan.md`

## What & Why

Office staff can currently book a lesson at any `scheduled_at`, including a time that has already passed — no layer of the app rejects it (TD-06, GitHub issue #68). This closes that data-integrity gap end-to-end: domain, DB, and calendar UI.

## Starting Point

`Lesson.propose()` checks instructor/student category coherence but never checks `scheduledAt`. The `book_lesson` Postgres RPC is the sole authoritative write path (`SECURITY DEFINER`, callable by any authenticated session) and mirrors the category/overlap checks per TD-01's precedent — but not a time check. `CalendarGrid.tsx` renders every slot as clickable regardless of whether its time has passed.

## Desired End State

A past `scheduledAt` is rejected at every layer: `Lesson.propose()` throws, `book_lesson` returns a structured error and inserts nothing, `createLesson()` surfaces "Cannot schedule a lesson in the past", and past slots on the office calendar grid are visibly muted and simply don't respond to a click — no error message ever needs to appear for this case in normal use, because the office can't select a past slot in the first place.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Guard layer | Domain (`Lesson.propose`) + DB RPC (`book_lesson`) | Mirrors the exact TD-01 pattern; the RPC is callable directly, so the domain check alone doesn't close the bypass | Plan |
| UI behavior | Click-level block on past slots; week navigation stays open | User explicitly wants the block enforced at the click stage, and staff still need to browse past weeks for history | Plan |
| Time boundary | Strict `scheduledAt < now`, no lead-time buffer | Matches the issue's literal scope; a buffer would be an unrequested new business rule | Plan |
| No table-level `CHECK` constraint | Rejected | A `now()`-based `CHECK` re-evaluates on every `UPDATE` and would retroactively break `respond_to_lesson`/`cancelLesson` on lessons whose time has since passed | Plan |
| UI test approach | Real component test via `@testing-library/react` + `jsdom` | User chose real rendered-behavior coverage over a pure-logic-only test, accepting the new (file-scoped) test infra | Plan |

## Scope

**In scope:**
- `PastScheduledAtError` in the domain layer
- Mirrored `SCHEDULED_AT_IN_PAST` check in the `book_lesson` RPC (new migration)
- Error-code → message wiring through `LessonRepository` and `createLesson`
- Click-level disable of past slots in `CalendarGrid`, with a new component test

**Out of scope:**
- Blocking past-week navigation in `WeeklyCalendar`
- Any minimum lead-time buffer beyond "already in the past"
- Table-level `CHECK` constraint on `lessons.scheduled_at`
- Playwright/E2E coverage for this change
- Any change to existing past-dated lesson rows

## Architecture / Approach

Bottom-up, one layer per phase: domain invariant → DB RPC mirror → server-action message wiring → UI click-guard. Each phase is independently testable; later phases build on the error code/message chain established by earlier ones.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Domain invariant | `Lesson.propose()` throws `PastScheduledAtError` | Low — pure logic, fake-timer tests |
| 2. DB RPC mirror | `book_lesson` rejects past `p_scheduled_at`, `LessonRepository` maps it | Low — follows an established migration pattern exactly |
| 3. Server action wiring | `createLesson()` returns the user-facing error message | Low — one more `if` branch in an existing function |
| 4. UI click-guard | Past slots muted/unclickable in the office calendar, with a new component test | Medium — introduces the repo's first component-test infra (scoped to one file) |

**Prerequisites:** None beyond the existing `npx supabase db push` hosted-project setup already used by prior changes.
**Estimated effort:** ~1 session across 4 small phases.

## Open Risks & Assumptions

- `Date.now()` in `CalendarGrid` is read per-render, not live-ticking — a slot that crosses from future to past while a tab sits open won't visually update until the next re-render. Acceptable: Phases 1–2 are the actual source of truth if a stale click ever slips through.
- Adding `@testing-library/react` + `jsdom` as devDependencies is a small, one-time footprint increase, scoped to a single test file via a per-file environment docblock — not a global test-runner change.

## Success Criteria (Summary)

- Attempting to book a lesson with a past `scheduledAt` — via the UI, the server action, or the RPC directly — is rejected at every layer, with no lesson row created.
- In the office calendar, staff simply cannot click a past slot to open the booking panel; future slots and past-week browsing behave exactly as before.
