<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Calendar Week Jump Picker Implementation Plan

- **Plan**: context/changes/calendar-week-jump-picker/plan.md
- **Scope**: Phase 1 of 2, Phase 2 of 2 (full plan)
- **Date**: 2026-09-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unused `date-fns` dependency added to package.json

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `package.json:33`
- **Detail**: `date-fns@^4.4.0` was pulled in by the shadcn `calendar` scaffold install, but nothing in `src/` imports it (`grep -rn "date-fns" src/` is empty), and it isn't a runtime/peer dependency of the installed `react-day-picker@10.0.1` (v10 dropped its date-fns dependency). It's dead weight left over from the CLI install.
- **Fix**: `npm uninstall date-fns`.
- **Decision**: FIXED — `npm uninstall date-fns` applied; `npm run typecheck` confirmed clean afterward.

### F2 — No unit test for the timezone conversion helpers

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `src/app/office/components/calendar/WeekPicker.tsx:19-31`
- **Detail**: `toLocalMidnight`/`toUTCMidnight` are the trickiest, most timezone-sensitive logic in this feature and are pure/deterministic (no DOM, no network) — a natural fit for a fast co-located test covering a few UTC offsets (positive, negative, half-hour). The plan explicitly decided against a new test file for this component (matches project convention for low-blast-radius UI), so this is not a violation — just worth flagging as a place a future regression could hide silently, given how easy the reasoning is to get subtly wrong (confirmed correct in this review, but non-obviously so).
- **Fix**: Optional — add `WeekPicker.test.ts` covering `toLocalMidnight`/`toUTCMidnight` at a couple of UTC offsets, if/when this file gets touched again.
- **Decision**: FIXED — added `src/app/office/components/calendar/WeekPicker.test.ts` (6 tests: behind-UTC, ahead-of-UTC, fractional UTC+5:30, both conversion directions, and a multi-timezone round-trip check). Exported `toLocalMidnight`/`toUTCMidnight` from `WeekPicker.tsx` to make them testable. Full suite: 79/79 passing.

## Notes (non-findings, investigated and cleared)

- **Timezone conversion correctness**: Verified correct for any UTC offset (integer or fractional, e.g. UTC+5:30) — both helpers extract Y/M/D fields directly rather than doing offset arithmetic, so there's no reliance on 24-hour-day math that would break at fractional offsets.
- **`getWeekStart`/`snapToMonday` regression risk**: Confirmed no behavior change for existing callers — `navigateWeek` always operates on already-Monday-aligned dates (a no-op through `snapToMonday`), and the existing test's `WEEK_START` (`2099-06-01`) is already a Monday.
- **`has-[:focus]` vs `has-[:focus-visible]`**: Explicitly checked — non-issue. The Calendar unmounts on selection (`setOpen(false)` before navigating) and remounts fresh on reopen, so no stale focus/highlight state can persist across popover sessions.
- **Leftover `cn` package**: Fully removed — no remaining imports from the `"cn"` npm package anywhere in `src/`; both new UI files correctly import from `@/lib/utils`.
- **Non-null assertions**: None found in any changed/new file (project's no-`!` rule respected).
- **`PopoverTrigger render={...}` vs the plan's literal `asChild` wording**: A forced, correct adaptation — the installed `popover.tsx` wraps Base UI (`@base-ui/react/popover`), whose composition API is `render`, not Radix's `asChild`. Functionally matches the plan's intent (a ghost Button drives the trigger).
