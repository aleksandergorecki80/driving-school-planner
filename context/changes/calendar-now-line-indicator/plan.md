# Calendar Now-Line Indicator Implementation Plan

## Overview

Add a live, precisely-positioned horizontal "now" line to today's column in the office weekly calendar grid, so office staff can see at a glance exactly where the current moment falls relative to booked lessons — not just which slots are dimmed as past. The line ticks on its own (independent of the 30s `AutoRefresh` poll), and the existing past-slot dimming becomes live along with it, sharing one ticking "now" value.

## Current State Analysis

- `src/app/office/components/calendar/CalendarGrid.tsx` is a client component rendering a CSS Grid (`gridTemplateRows: '2.5rem repeat(28, 2rem)'`, `SLOT_START_HOUR = 7`, `SLOT_COUNT = 28` → visible window 07:00–21:00 in 30-min steps). It computes `officeNowAsNaiveUTC().getTime()` once per render (a plain `const`, not state) and uses it only to dim past slots (`aria-disabled`) and block clicks on them (`CalendarGrid.tsx:37,84,88`).
- `src/lib/office-time.ts`'s `officeNowAsNaiveUTC()` (added by TD-15, `past-lesson-timezone-check`) returns "now" relabeled as if Europe/Warsaw wall-clock were UTC — the same naive-local-as-UTC convention lesson times are stored/displayed in. This is the only correct time source for any past/future comparison in this grid; using `Date.now()` directly would reintroduce the TD-15 bug.
- `src/app/office/components/AutoRefresh.tsx` does a full `router.refresh()` every 30s — a server round-trip, not a lightweight client tick. There is no other `setInterval`/ticking pattern anywhere in the office calendar.
- `days` (from `WeeklyCalendar.tsx`) are UTC-midnight `Date`s per calendar day; lesson slot placement already compares using `getUTCHours()`/`getUTCDay()` (`CalendarGrid.tsx:100-109`) — the same UTC-labelled-as-local convention `officeNowAsNaiveUTC()` produces, so day/time comparisons must consistently use the `getUTC*` accessors, never local-timezone `Date` getters.
- Lesson status coloring (`src/components/lesson/lesson-status.ts`) deliberately avoids `--destructive` (red) — `rejected` already uses `red-400`/`red-100`. No blue is used anywhere in this UI currently.
- `LessonBlock.tsx` renders with `z-10`; sticky day/corner headers use `z-20` (non-overlapping regions, so no real z-index conflict risk between the two).
- Existing motion convention (from TD-08, `calendar-week-transition-animation`): `motion-reduce:animate-none` gates all animation in `CalendarGrid.tsx`'s className (line 44) — the same gating convention applies to any new transition.
- `CalendarGrid.test.tsx` mocks `officeNowAsNaiveUTC` via `vi.spyOn(officeTime, 'officeNowAsNaiveUTC').mockReturnValue(NOW)` — a fixed return value. This pattern breaks for testing ticking behavior (see Critical Implementation Details).

## Desired End State

Today's column in the office calendar shows a thin blue horizontal line with a small dot on its left edge, positioned at the exact fractional point within the current half-hour slot (not snapped to the slot boundary), visible only when "now" (per `officeNowAsNaiveUTC()`) falls within the visible 07:00–21:00 window. The line sits above lesson blocks. Its position updates every 60 seconds on its own, and past-slot dimming/click-guarding updates on the same cadence (previously only updated on navigation or the 30s `AutoRefresh` poll). Position changes animate via a short CSS transition, disabled under `prefers-reduced-motion`.

### Key Discoveries:

- `CalendarGrid.tsx:37` — the single `nowMs` computation site that both dimming and the new line must share.
- `CalendarGrid.tsx:100-109` — the established UTC-labelled-as-local comparison pattern (`getUTCHours`, `getUTCDay`) that "is this today"/position math must follow.
- `office-time.ts`'s doc comment — explicit warning about the UTC-offset bug class (TD-15) that any new time comparison in this area must avoid repeating.

## What We're NOT Doing

- No changes to `AutoRefresh.tsx` or its 30s poll cadence.
- No inline time label (e.g. "14:32") next to the line — line + dot only.
- No now-line on any column other than today's, and no faint/secondary indicator on other days.
- No clamped line at the top/bottom edge when "now" falls outside 07:00–21:00 — the line is hidden entirely in that case.
- No changes to `officeNowAsNaiveUTC()` itself or to the `book_lesson` RPC / domain past-time checks (TD-15's territory) — this change only consumes the existing helper.

## Implementation Approach

Extract the grid's slot-window constants into a small shared module so a new pure position-calculation function can depend on them without importing from a `'use client'` component file. That pure function (`computeNowLineTop`) takes a day and a "now" instant and returns either a 0–1 fraction (where to draw the line) or `null` (don't draw — wrong day, or outside the visible window); it's unit-tested directly at fixed instants. Separately, `CalendarGrid` converts its static `nowMs` into ticking state (60s `setInterval`, cleaned up on unmount) shared by both the existing dimming logic and a new `NowLine` presentational component, which renders the line + dot for whichever day (if any) the pure function says to draw on.

## Critical Implementation Details

- **Test timer strategy**: `CalendarGrid.test.tsx`'s existing tests mock `officeNowAsNaiveUTC` to a fixed `mockReturnValue`. That pattern cannot prove a tick actually moves the line, because the mock would keep returning the same instant across ticks regardless of fake-timer advancement. New tests verifying ticking must instead use `vi.useFakeTimers()` + `vi.setSystemTime(...)` and let the real `officeNowAsNaiveUTC()` run unmocked — advancing fake system time then firing the interval naturally produces new real values. Keep the existing fixed-mock tests as-is for the non-ticking assertions (initial render dimming); only the new ticking-specific tests need the system-time approach.
- **"Today" and window-membership comparison**: must use `getUTCFullYear`/`getUTCMonth`/`getUTCDate` on both `day` and `now` (never local-timezone `Date` getters, never compare against `Date.now()`) — matching the existing lesson-placement convention and avoiding a reintroduction of the TD-15 bug class in a new code path.

## Phase 1: Shared constants + pure now-line position math

### Overview

Move the slot-window constants out of `CalendarGrid.tsx` into a small shared module, then add a pure, fully unit-tested function that decides whether and where to draw the now-line for a given day.

### Changes Required:

#### 1. Shared grid constants module

**File**: `src/app/office/components/calendar/grid-constants.ts` (new)

**Intent**: Give both `CalendarGrid.tsx` and the new pure position-math module a single source of truth for the visible slot window, instead of duplicating the magic numbers.

**Contract**: Exports `SLOT_START_HOUR = 7` and `SLOT_COUNT = 28`. `CalendarGrid.tsx` imports both from here instead of declaring its own local consts; all existing usages (`SLOT_LABELS` generation, slot offset math, lesson slot-index math) are unchanged, just re-sourced.

#### 2. Now-line position math

**File**: `src/app/office/components/calendar/now-line.ts` (new)

**Intent**: Decide, for a given calendar day and a given "now" instant, whether the now-line should render on that day's column and at what fractional vertical position — pure and independent of React/rendering.

**Contract**: Exports `NOW_LINE_TICK_MS = 60_000` and `computeNowLineTop(day: Date, now: Date): number | null`. Returns `null` when `day` (compared via UTC year/month/date) is not the same calendar date as `now`, or when `now`'s time-of-day falls outside `[SLOT_START_HOUR:00, SLOT_START_HOUR + SLOT_COUNT*30min)`. Otherwise returns a fraction in `[0, 1)` representing how far through the visible window "now" falls — the caller multiplies by 100 for a CSS `top` percentage. Uses `getUTCHours`/`getUTCMinutes`/`getUTCFullYear`/`getUTCMonth`/`getUTCDate` throughout (never local-timezone getters, never `Date.now()`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (runs type-check)
- Linting passes: `npm run lint`
- Unit tests pass: `npm test -- now-line` (or repo's equivalent vitest invocation) covering: exact window start (07:00 → fraction 0), exact window end boundary (SLOT_START_HOUR + SLOT_COUNT\*30min → `null`, since the window is exclusive of its end), a mid-window instant landing partway through a half-hour slot (fraction not aligned to a slot boundary), an instant before 07:00 (`null`), an instant after 21:00 (`null`), and a `day` that isn't the same calendar date as `now` (`null`) regardless of time-of-day

#### Manual Verification:

- N/A — this phase has no visible UI change; proceed directly to Phase 2 once automated checks pass.

---

## Phase 2: Ticking state, `NowLine` component, and CalendarGrid wiring

### Overview

Make `CalendarGrid`'s "now" a ticking value shared by both the existing past-slot dimming and a new `NowLine` component, and render that component above lesson blocks on today's column with the agreed visual style, color, and motion behavior.

### Changes Required:

#### 1. `NowLine` presentational component

**File**: `src/app/office/components/calendar/NowLine.tsx` (new)

**Intent**: Render the line + dot for one day column, or nothing if `computeNowLineTop` returns `null` for that day.

**Contract**: Props `{ day: Date; now: Date; gridColumn: number }`. Internally calls `computeNowLineTop(day, now)`; renders `null` when it returns `null`. Otherwise renders a wrapper spanning the full slot-row range in the given `gridColumn` (`gridRow: '2 / -1'`, `position: relative`, `pointer-events: none` so it never blocks slot clicks or lesson-block clicks beneath/around it), containing an absolutely-positioned line (`top: ${fraction * 100}%`) plus a small dot at its left edge. Uses a blue accent (a Tailwind blue shade with a `dark:` variant, following the same explicit-Tailwind-palette convention as `lesson-status.ts` rather than a shadcn theme token) and `z-20` so it draws above `LessonBlock`'s `z-10`. Position changes use `transition-[top] duration-300 motion-reduce:transition-none`, matching the existing `motion-reduce:` gating convention from TD-08.

#### 2. `CalendarGrid` ticking state + wiring

**File**: `src/app/office/components/calendar/CalendarGrid.tsx`

**Intent**: Replace the static per-render `nowMs` const with state that ticks every `NOW_LINE_TICK_MS`, so both past-slot dimming and the now-line stay live between navigations/`AutoRefresh` polls. Render one `NowLine` per day column.

**Contract**: `const [now, setNow] = useState(() => officeNowAsNaiveUTC())`, with a `useEffect` starting a `setInterval(() => setNow(officeNowAsNaiveUTC()), NOW_LINE_TICK_MS)` and clearing it on unmount. `nowMs` (used by the existing dimming/click-guard logic) is derived from `now.getTime()` — no change to the dimming/click-guard logic itself, only to where its input comes from. After the lesson-blocks `.map(...)`, add `{days.map((day, colIdx) => <NowLine key={colIdx} day={day} now={now} gridColumn={colIdx + 2} />)}` so `NowLine` mounts after (and thus, combined with its `z-20`, stacks above) lesson blocks.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Existing tests still pass: `npm test -- CalendarGrid` (the two existing fixed-`officeNowAsNaiveUTC`-mock tests continue to pass unmodified)
- New ticking tests pass, using `vi.useFakeTimers()` + `vi.setSystemTime(...)` (real `officeNowAsNaiveUTC`, unmocked) covering: the line is present/absent correctly at mount for a given system time, advancing fake time by `NOW_LINE_TICK_MS` moves the line's computed top position, and a previously-dimmed-vs-not slot's `aria-disabled` value changes after advancing fake time across a slot boundary without re-rendering the component via props

#### Manual Verification:

- Open the office calendar on today's week: the line appears on today's column at the visually correct position for the current time, above any lesson block it crosses
- Wait past a `NOW_LINE_TICK_MS` interval with the tab open: the line visibly (and smoothly) moves down; a slot that just became past dims without navigating away and back
- Navigate to a week that does not include today: no now-line renders on any column
- With system clock set (via OS/browser override, or by testing before 07:00 or after 21:00 office-local time) outside the visible window: no now-line renders on today's column, and no console errors
- Toggle OS-level "reduce motion" and confirm the line's position updates without a sliding transition
- Confirm in both light and dark mode the line/dot color remains legible and distinct from all three lesson-status colors (amber/emerald/red)

---

## Testing Strategy

### Unit Tests:

- `now-line.ts`'s `computeNowLineTop`: window-start boundary, window-end boundary (exclusive), mid-slot fractional position, before-window, after-window, wrong-day.

### Integration Tests:

- `CalendarGrid.tsx` rendering with fake timers + real `officeNowAsNaiveUTC`: line presence/position at a fixed system time, line movement after a simulated tick, live dimming update after a simulated tick — as detailed in Phase 2's Automated Verification.

### Manual Testing Steps:

1. Load `/office` on the current week; visually confirm line position matches the system clock's actual time.
2. Leave the tab open across a tick interval; confirm the line moves and past-slot dimming updates without navigating.
3. Navigate to a past and a future week; confirm no line renders on any column in either.
4. Confirm stacking (line drawn above a lesson block scheduled around the current time) and color legibility in both themes.

## Performance Considerations

The 60s tick re-renders the whole `CalendarGrid` (up to 7×28 slots plus lesson blocks) once per interval — the same order of re-render cost `AutoRefresh`'s 30s `router.refresh()` already causes today, just at a lower additional frequency, so no new performance concern.

## Migration Notes

None — purely additive UI, no data model or persisted-state changes.

## References

- `src/app/office/components/calendar/CalendarGrid.tsx`
- `src/lib/office-time.ts` (TD-15, `context/changes/past-lesson-timezone-check/plan.md`)
- `src/app/office/components/AutoRefresh.tsx`
- `src/components/lesson/lesson-status.ts`
- Roadmap entry: `context/foundation/roadmap.md` TD-16

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared constants + pure now-line position math

#### Automated

- [x] 1.1 Type checking passes: `npm run build` — 1f12401
- [x] 1.2 Linting passes: `npm run lint` — 1f12401
- [x] 1.3 Unit tests pass: `npm test -- now-line` (window-start, window-end boundary, mid-slot fraction, before-window, after-window, wrong-day) — 1f12401

### Phase 2: Ticking state, `NowLine` component, and CalendarGrid wiring

#### Automated

- [x] 2.1 Type checking passes: `npm run build`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Existing tests still pass: `npm test -- CalendarGrid`
- [x] 2.4 New ticking tests pass (fake timers + real `officeNowAsNaiveUTC`): presence/position at mount, position moves after a tick, live dimming update after a tick

#### Manual

- [x] 2.5 Line appears at the visually correct position on today's column, above any crossed lesson block
- [x] 2.6 Line moves and past-slot dimming updates live after a tick interval, without navigating
- [x] 2.7 No now-line renders when navigating to a week that doesn't include today
- [x] 2.8 No now-line renders when "now" falls outside the 07:00–21:00 window (verified via automated unit tests, not a live browser check — accepted as sufficient)
- [x] 2.9 Reduced-motion preference disables the position transition
- [x] 2.10 Line/dot color is legible and distinct from all three lesson-status colors in both light and dark mode
