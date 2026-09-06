<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Calendar Now-Line Indicator

- **Plan**: context/changes/calendar-now-line-indicator/plan.md
- **Scope**: Phase 1 and Phase 2 (full plan)
- **Date**: 2026-09-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

All 6 changed files (`grid-constants.ts`, `now-line.ts`, `now-line.test.ts`, `NowLine.tsx`, `CalendarGrid.tsx`, `CalendarGrid.test.tsx`) match the plan's Changes Required with no drift and no missing pieces. No files outside the plan were touched. Automated verification re-run at review time: `npm run build` ✅, `npm run lint` ✅, `npx vitest run` — 93/93 tests passing ✅. Manual verification (Phase 2) was completed live in a real browser during implementation (line position/stacking, live tick without navigation, no-line-on-off-week, reduced-motion gating, color legibility in both themes); the one item not checked live (outside 07:00–21:00 window) is covered by automated unit tests only, accepted by the user as sufficient.

## Findings

### F1 — `setInterval` re-renders the whole grid every tick

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped, and not currently needed
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/app/office/components/calendar/CalendarGrid.tsx:39-42
- **Detail**: Every 60s tick re-renders all ~196 empty-slot cells, lesson blocks, and 7 `NowLine` components to update dimming and the line position, even though only cells near the "now" boundary actually change. Negligible at current scale (28 slots × 7 days) and same order of cost as `AutoRefresh`'s existing 30s `router.refresh()`.
- **Fix**: No action needed now; if `SLOT_COUNT` or day-count grows significantly later, memoize the empty-slot cells.
- **Decision**: FIXED — extracted a memoized `SlotCell` component (CalendarGrid.tsx) so only cells whose `isPast` value actually changes re-render on a tick.

### F2 — Blue color choice lacks an explanatory comment

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/office/components/calendar/NowLine.tsx:26-27
- **Detail**: `lesson-status.ts` carries a comment explaining why it deliberately avoids the shadcn `--destructive` token in favor of explicit Tailwind palette classes. `NowLine.tsx` follows the same convention correctly (`bg-blue-500 dark:bg-blue-400`) but doesn't say why, so a future reader might not realize the choice (avoiding collision with lesson-status colors) is deliberate.
- **Fix**: Add a one-line comment near the color classes noting blue is chosen to stay distinct from the amber/emerald/red lesson-status palette.
- **Decision**: FIXED — added a one-line comment above the marker div in NowLine.tsx.

### F3 — Testability additions not spelled out in the plan

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/app/office/components/calendar/NowLine.tsx:16-22
- **Detail**: `aria-hidden="true"`, `data-testid="now-line"` / `"now-line-marker"`, and the `-translate-y-1/2` centering transform weren't explicitly named in the plan's Contract. All are additive, non-contradicting, and necessary for the fake-timer tests the plan itself calls for — not real scope creep.
- **Fix**: No action needed.
- **Decision**: SKIPPED
