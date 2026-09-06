# Calendar Now-Line Indicator — Plan Brief

> Full plan: `context/changes/calendar-now-line-indicator/plan.md`

## What & Why

Office staff currently see past slots dimmed (`aria-disabled:opacity-50`) but there's no precise visual marker for "exactly where is now." Add a Google-Calendar-style horizontal line + dot on today's column, positioned to the exact minute (not snapped to the half-hour slot boundary), that updates live on its own — not just when the 30s `AutoRefresh` poll fires. Roadmap TD-16, GitHub issue #87.

## Starting Point

`CalendarGrid.tsx` already computes `officeNowAsNaiveUTC()` (the TD-15 helper for comparing "now" correctly against this app's naive-local-as-UTC lesson times) once per render, using it only to dim/disable past slots. That value is static per-render — it only changes on navigation or a full `AutoRefresh` refresh. There's no ticking/interval pattern anywhere in the calendar, no "is this today" logic, and no blue used anywhere in the current color scheme (red/amber/emerald are all taken by lesson status).

## Desired End State

A thin blue line with a small dot sits at the precise current-time position on today's column, drawn above lesson blocks, invisible outside the 07:00–21:00 grid window. It creeps down smoothly (respecting reduced-motion) every 60 seconds on its own, and past-slot dimming now updates on that same live cadence instead of waiting for the next poll or navigation.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Visual style | Line + small dot on the left edge | Google-Calendar-familiar, anchors the eye without adding a text label to a narrow column |
| Color | Blue accent (Tailwind palette, not `--destructive`) | Red is already "rejected" in this UI — a red now-line would misread as a status indicator |
| Tick rate | Every 60 seconds, own client-side interval | Matches perceivable precision at this UI's scale; independent of `AutoRefresh`'s 30s poll |
| Outside business hours (07:00–21:00) | Hide the line entirely | A clamped line at the edge would misleadingly imply a specific (wrong) time |
| Stacking vs. lesson blocks | Line renders above lesson blocks | The line's whole purpose (showing exact current time) is defeated if a lesson can hide it |
| Past-slot dimming liveness | Shares the same ticking "now" as the line | One source of truth; matches TD-16's own framing of reusing the existing past/future determination |
| Motion | Smooth CSS transition, `motion-reduce:` gated | Matches the existing week-transition-animation (TD-08) convention already in this file |
| Testing | Fake timers + real (unmocked) `officeNowAsNaiveUTC`, plus separate pure-function tests | Proves the tick lifecycle actually works, not just the position math; existing fixed-mock tests can't prove ticking |

## Scope

**In scope:**
- New pure `computeNowLineTop(day, now)` function + unit tests
- New `NowLine` component (line + dot, color, motion, stacking)
- Converting `CalendarGrid`'s static `now` into ticking state shared with existing dimming logic
- Fake-timer integration tests for the ticking behavior

**Out of scope:**
- Changes to `AutoRefresh`'s 30s poll cadence
- An inline time-label next to the line
- Any indicator on non-today columns
- Changes to `officeNowAsNaiveUTC()` itself or the TD-15 domain/RPC past-time checks

## Architecture / Approach

Slot-window constants (`SLOT_START_HOUR`, `SLOT_COUNT`) move into a shared `grid-constants.ts` so a new pure `now-line.ts` module can compute, for a given day and "now" instant, either `null` (don't draw) or a 0–1 fraction (where to draw). `CalendarGrid` converts its `nowMs` const into `useState` + a 60s `setInterval`, and renders one `NowLine` per day column after the lesson blocks (so it stacks visually above them).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared constants + pure position math | Fully unit-tested `computeNowLineTop`, no UI change yet | Getting the UTC-labelled-as-local comparison right (reusing the TD-15 lesson) |
| 2. Ticking state, `NowLine` component, wiring | Visible, live-updating line + live dimming | Fake-timer test correctness — must unmock `officeNowAsNaiveUTC` and use `vi.setSystemTime`, unlike existing tests |

**Prerequisites:** None beyond what's already shipped (TD-15's `officeNowAsNaiveUTC`, TD-08's motion-reduce convention).
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- The existing `CalendarGrid.test.tsx` mocking convention (`vi.spyOn(...).mockReturnValue`) doesn't extend to ticking tests — Phase 2 introduces a second, different timer-mocking approach in the same test file; kept as narrowly scoped as possible to avoid confusing future readers of that file.

## Success Criteria (Summary)

- Office staff can see, at a glance and to the minute, exactly where "now" falls on today's calendar column.
- The line and past-slot dimming stay accurate without requiring a manual refresh or navigation.
- No visual confusion with existing lesson-status colors, in either light or dark mode.
