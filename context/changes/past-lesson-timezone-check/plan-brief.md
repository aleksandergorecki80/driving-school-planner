# Past Lesson Timezone Check — Plan Brief

> Full plan: `context/changes/past-lesson-timezone-check/plan.md`

## What & Why

Fix a confirmed live bug: TD-06's "block booking in the past" checks compare a naive-local-time-labeled-as-UTC `scheduled_at` against the true UTC instant, instead of the office's real Warsaw wall-clock time. In Poland's UTC+2 offset, this let a lesson up to ~2 hours in the past slip through both the UI guard and the server-side RPC — reproduced live, one bad row created and manually cancelled during triage.

## Starting Point

Three independent checks all use the same wrong comparison (`scheduled_at < Date.now()` / SQL `now()`): `CalendarGrid.tsx`'s click guard, `Lesson.propose()`'s domain invariant, and the `book_lesson` RPC. No timezone configuration exists anywhere in the codebase today.

## Desired End State

All three checks compare against "now, relabeled the same naive way" — the office's actual Warsaw wall-clock time — so a lesson that has really passed by the office's clock is blocked everywhere, even when true UTC hasn't caught up to its naive-labeled hour yet.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Office timezone source | Hardcoded `'Europe/Warsaw'` constant (TS) + literal (SQL) | Matches this single-location app's total lack of per-deployment config elsewhere | Plan |
| Fix scope | Patch the 3 comparisons only, keep the naive-as-UTC convention | A full real-UTC migration would touch every date site (display, email, tests) — disproportionate to this bug | Plan |
| Test coverage | Yes — update 3 existing tests, add 3 new regression tests | This is core booking-safety logic, not UI polish; the existing tests would otherwise silently assert the wrong thing post-fix | Plan |
| Test mocking strategy | Mock `officeNowAsNaiveUTC` directly rather than fake the system clock | Fake-system-time + real DST math breaks existing fixtures unpredictably (verified by hand); mocking the helper decouples boundary-logic tests from timezone-conversion tests | Plan |

## Scope

**In scope:**
- New shared `src/lib/office-time.ts` helper (`officeNowAsNaiveUTC`) + its own DST-aware test
- Fix `CalendarGrid.tsx`, `Lesson.ts`, and the `book_lesson` RPC to use it
- Update 3 existing tests whose fixtures would otherwise silently break
- Add 3 new regression tests reproducing the exact bug shape (unit ×2, integration ×1)
- Manual cleanup of the one bad row already created (done during triage, before planning)

**Out of scope:**
- Migrating the whole app to real UTC timestamps
- An `OFFICE_TIMEZONE` environment variable
- Any change to error messages or the strict `<` boundary semantics
- Any change to `createLesson.ts`/`LessonRepository.ts` (they only catch/map the error, no independent date check)

## Architecture / Approach

One shared TypeScript helper (`officeNowAsNaiveUTC`, using `Intl.DateTimeFormat` with an explicit `Europe/Warsaw` timeZone) serves both the client guard and the domain invariant. The SQL RPC gets the equivalent fix via Postgres's `AT TIME ZONE` operator, hardcoding the same timezone as a literal. All three checks now agree on what "now" means, regardless of DST.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Shared helper | `office-time.ts` + its own DST test | None — new, isolated code |
| 2. Calendar UI guard | `CalendarGrid.tsx` fixed + test re-mocked | Existing test fixture must be re-mocked correctly, not just left broken |
| 3. Domain invariant | `Lesson.ts` fixed + 3 tests re-mocked + 1 new regression test | Same re-mocking care as Phase 2 |
| 4. RPC | New migration + 1 new integration regression test | Runs against the real hosted Supabase instance — migration must be applied there |

**Prerequisites:** None — this is a standalone hotfix for already-shipped TD-06.
**Estimated effort:** Four short phases, roughly one session.

## Open Risks & Assumptions

- Assumes the office is always physically in `Europe/Warsaw` — true today (single-location school), and consistent with the rest of the app's design.
- The exact mechanism for applying the new migration to the live Supabase project (CLI push vs dashboard) isn't yet confirmed — Phase 4 notes this as something to verify against whatever this repo's existing migration-apply process is.

## Success Criteria (Summary)

- A lesson that has passed by the office's real wall clock is blocked everywhere (UI, domain, RPC) — even when true UTC hasn't reached its naive-labeled hour.
- All existing tests still pass (updated where their fixtures depended on the old, wrong semantics); 3 new regression tests reproduce the exact bug shape and fail on the old code / pass on the new.
