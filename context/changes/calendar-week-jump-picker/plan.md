# Calendar Week Jump Picker Implementation Plan

## Overview

Make the office calendar's week-range label clickable, opening a date-picker so the user can jump directly to an arbitrary week instead of only stepping one week at a time via Prev/Next (TD-09, GitHub issue #73).

## Current State Analysis

- `WeeklyCalendar.tsx:68-72` renders the week-range label as a plain, non-interactive `<span>{formatWeekLabel(weekStart)}</span>`.
- No date-picker infrastructure exists: `src/components/ui/` has no `calendar.tsx` or `popover.tsx` (Popover was previously installed then deliberately deleted during `shadcn-design-refresh` for lack of a use case — this feature is that use case); no date library (`react-day-picker`, `date-fns`) is an app dependency today.
- `office/page.tsx:18-27`'s `getWeekStart()` only snaps to Monday on its no-`week`-param fallback path (lines 23-26); an explicit `?week=` value (lines 19-21) is used verbatim with no Monday validation. Today this is invisible because the only caller of `navigateWeek` always operates on already-Monday-aligned dates (±7 days) — a date picker breaks that invariant by letting the user pick any day of the week.
- `WeeklyCalendar` renders as a sibling of `LessonPanel`'s `Drawer` (`LessonPanel.tsx:49-73`), not a descendant — confirmed via research that none of TD-05's vaul/Base-UI portal-race workarounds apply here; a default `document.body`-portaled Popover is safe.
- TD-08 (shipped, commit `8e4b70f`) added `direction` state + `goToWeek`-shaped navigation logic (currently inlined in `navigateWeek`) plus `useTransition`/`isPending` for instant click feedback — this plan extends that same mechanism rather than introducing a parallel one.

## Desired End State

Clicking the week-range label opens a calendar popover showing the currently displayed week's Monday as selected. Picking any day — from a past, current, or future week — closes the popover and navigates to that day's Monday-starting week, with the same direction-aware slide animation and instant pending-feedback Prev/Next already have. Manually setting `?week=` to a non-Monday date also always resolves to the correct week (server-side correctness, independent of the picker). Hovering or keyboard-focusing any day in the picker highlights that day's entire week row, previewing what will be jumped to before it's clicked.

### Key Discoveries:

- The Monday-snap formula already exists once, in `getWeekStart`'s fallback branch (`office/page.tsx:24-26`) — hardening the parsed-`weekParam` path to use the same formula (rather than duplicating it elsewhere) is a single, small, self-contained fix.
- `navigateWeek`'s direction + `startTransition` + `router.push` logic (`WeeklyCalendar.tsx`, post-TD-08) generalizes cleanly to "navigate to an arbitrary target week," not just ±7 days — extracting it into a shared `goToWeek(newStart: Date)` avoids duplicating that logic for the new picker.
- The exact react-day-picker version (and its day-level hover/focus event prop names) is only known once `npx shadcn add calendar` actually runs — Phase 2's hover/focus week-highlight implementation must consult the installed library's own type definitions rather than assuming a specific API shape now.

## What We're NOT Doing

- Not restricting which dates can be picked — past weeks remain freely navigable, matching the existing unrestricted Prev/Next behavior (TD-06's past-time restriction applies only to *booking* a lesson, not to calendar navigation).
- Not adding a confirm/apply step — picking a date immediately closes the popover and navigates, consistent with this codebase's existing Select-like immediate-action UI.
- Not adding a new test file — this is additive UI wiring over the existing, already-tested `?week=` navigation mechanism.
- Not extracting a shared `src/lib/date-utils.ts` module — the Monday-snap fix stays inside `getWeekStart` itself (the one function that needs to guarantee it), consistent with this codebase's existing file-local date-helper convention; there still isn't a second real caller that would justify centralizing it.
- Not touching `AutoRefresh`, polling, or lesson booking/creation logic.

## Implementation Approach

Two phases: first ship a fully working picker (install shadcn `calendar`+`popover`, harden `getWeekStart`, wire a `WeekPicker` trigger into `WeeklyCalendar` via a shared `goToWeek` navigation path), then layer on the whole-week hover/focus highlight as a separate, self-contained polish pass once the installed `react-day-picker` version's exact day-event API is known.

## Critical Implementation Details

- **Library version uncertainty (Phase 2 only)**: `npx shadcn add calendar` pulls in whatever `react-day-picker` version the shadcn registry currently ships. Its day-level hover/focus callback prop names differ between react-day-picker major versions. Before writing Phase 2's modifier-wiring code, check `node_modules/react-day-picker`'s own type definitions/docs for the currently-installed version's actual day-hover/day-focus API — do not assume a specific prop name from prior knowledge.

## Phase 1: Working picker — install, harden, wire

### Overview

Install shadcn's `calendar` and `popover`, close the Monday-snap gap in `getWeekStart`, and wire a new `WeekPicker` trigger into `WeeklyCalendar` through a shared direction-aware navigation path.

### Changes Required:

#### 1. Install shadcn Calendar + Popover

**Intent**: Add the UI primitives this feature needs, following this project's existing "install what you use" shadcn discipline.

**Contract**: Run `npx shadcn add calendar popover`. Confirms `src/components/ui/calendar.tsx` and `src/components/ui/popover.tsx` exist, and `react-day-picker` (+ its own dependencies, e.g. `date-fns`) appear in `package.json`.

#### 2. Harden `getWeekStart()` to always snap to Monday

**File**: `src/app/office/page.tsx`

**Intent**: Guarantee any `?week=` value — however it arrives, including from the new picker or a hand-edited URL — resolves to that date's Monday, closing the gap surfaced in research.

**Contract**: Apply the same Monday-snap arithmetic already used in the fallback branch (lines 24-26) to the parsed `weekParam` date too, instead of returning it verbatim:

```ts
function snapToMonday(d: Date): Date {
  const dayOfWeek = d.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysFromMonday))
}
```

`getWeekStart` calls `snapToMonday(d)` on the parsed `weekParam` path instead of returning `d` directly, and calls `snapToMonday(now)` on the existing fallback path (replacing its inlined version of the same formula).

#### 3. New `WeekPicker` trigger + popover

**File**: `src/app/office/components/calendar/WeekPicker.tsx` (new)

**Intent**: Present the week-range label as a clickable trigger that opens a calendar for picking an arbitrary date.

**Contract**: Client component. Props: `{ weekStart: Date; weekLabel: string; onSelect: (date: Date) => void }`. Renders `Popover` (own `open` state) with `PopoverTrigger asChild` wrapping a `Button variant="ghost" size="sm"` displaying `weekLabel` (replacing the current plain-text look with the same ghost-button affordance Prev/Next already use); `PopoverContent` renders `Calendar mode="single" weekStartsOn={1} selected={...} onSelect={...}`, where the Calendar's `onSelect` closes the popover and invokes the `onSelect` prop with the picked `Date`. `weekStartsOn={1}` is required — react-day-picker defaults to Sunday-first weeks, which would visually conflict with `CalendarGrid`'s Monday-first layout (found during manual verification).

**Timezone boundary (found during manual verification)**: this app's dates are UTC-midnight `Date` objects (`parseWeekStart`, `toISODate`), but react-day-picker's `Calendar` operates in the browser's local timezone for both display and selection. Passing `weekStart` straight into `selected`, or the picked `Date` straight into `onSelect`, silently shifts the calendar day whenever the local UTC offset isn't zero (confirmed: clicking Monday the 21st navigated to Monday the 14th under UTC+2, because local midnight on the 21st converts to Sunday 22:00 UTC on the 20th, which `getWeekStart` then snaps back a further 6 days). `WeekPicker` must convert at both boundaries: `selected={toLocalMidnight(weekStart)}` (re-anchor the UTC calendar day to local midnight for correct highlighting) and `onSelect((date) => onSelect(toUTCMidnight(date)))` (re-anchor react-day-picker's local-midnight result back to UTC midnight before it flows into `goToWeek`).

#### 4. Unify navigation through `goToWeek`, wire in `WeekPicker`

**File**: `src/app/office/components/calendar/WeeklyCalendar.tsx`

**Intent**: Route both Prev/Next stepping and the new arbitrary date-pick through one direction-aware navigation path, and swap the static label for the new trigger.

**Contract**: Extract the body of `navigateWeek` (direction calculation, `startTransition`, `router.push`) into `goToWeek(newStart: Date)`; `navigateWeek(delta)` becomes a one-line caller (`goToWeek(new Date(weekStart.getTime() + delta * 7 * 24 * 60 * 60 * 1000))`). Direction is computed generically (`newStart > weekStart ? 'forward' : newStart < weekStart ? 'backward' : null`) so it still applies sensibly to an arbitrarily-distant picked week. Replace the `<span>{formatWeekLabel(weekStart)}</span>` at lines 68-70 with `<WeekPicker weekStart={weekStart} weekLabel={formatWeekLabel(weekStart)} onSelect={goToWeek} />`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Full build succeeds: `npm run build`
- Existing test suite still passes: `npm test`

#### Manual Verification:

- Clicking the week-range label opens a calendar popover.
- The popover shows the currently displayed week's Monday as the selected date.
- Picking any day (including a mid-week day, not just a Monday) closes the popover and navigates to that day's correct Monday-starting week.
- Manually editing the URL to `?week=` a non-Monday date (e.g. a Thursday) still renders the correct Monday-starting week.
- Picking a future week slides in from the right, a past week from the left (reusing TD-08's direction logic); Prev/Next and the pending-feedback dimming still work unchanged.
- Picking a date within the currently-displayed week (no actual week change) closes the popover without errors or a spurious animation replay.
- The picker's calendar weeks start on Monday, matching `CalendarGrid`'s day ordering (not Sunday-first).
- Clicking a specific date (e.g. Monday the 21st) navigates to that exact date's week — not a week off in either direction (timezone boundary check).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Phase 2: Whole-week hover/focus highlight

### Overview

Layer on a visual preview: hovering or keyboard-focusing any day in the picker highlights the entire Monday-Sunday row it belongs to, before the user commits to a click.

### Changes Required:

#### 1. Week-row highlight modifier

**File**: `src/app/office/components/calendar/WeekPicker.tsx`

**Intent**: Preview which whole week is about to be jumped to, for both mouse and keyboard users (not hover-only, for accessibility).

**Contract**: Track the currently hovered-or-focused day as component state. Pass a `modifiers` prop to `Calendar` marking every day sharing an ISO week (Monday-based) with that day, plus a `modifiersClassNames` entry applying a highlight background across the row. Wire the installed `react-day-picker` version's actual day-level hover and focus event props into that state (see Critical Implementation Details — confirm the exact prop names against the installed version's types before implementing, since this differs across react-day-picker major versions).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Full build succeeds: `npm run build`
- Existing test suite still passes: `npm test`

#### Manual Verification:

- Hovering any day with the mouse highlights the entire Monday-Sunday row it belongs to.
- Tabbing to a day via keyboard also highlights its whole week row (not mouse-only).
- The highlight clears when the pointer leaves the calendar or focus moves elsewhere.
- No layout shift or visual glitch is introduced by the modifier styling.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None added (see What We're NOT Doing) — existing type-checking and lint gates cover the wiring correctness for this change.

### Manual Testing Steps:

1. Open `/office`, select an instructor, click the week-range label — confirm a calendar popover opens with the current week's Monday selected.
2. Pick a Wednesday two weeks in the future — confirm the calendar jumps to that Wednesday's Monday-starting week, sliding in from the right.
3. Pick a day in a past week — confirm it slides in from the left.
4. Manually edit the URL's `?week=` to a non-Monday date and reload — confirm the correct Monday-starting week renders.
5. Reopen the picker and hover over several days — confirm the whole week row highlights per hovered day (Phase 2).
6. Tab through days via keyboard — confirm the same whole-week highlight follows focus (Phase 2).

## Performance Considerations

None — a client-side popover and calendar, no additional data fetching beyond the existing `?week=`-driven Server Component refetch already in place.

## Migration Notes

None — no schema or data changes; `getWeekStart`'s hardening is backward-compatible (Prev/Next already only ever pass Monday-aligned dates, so snapping them is a no-op).

## References

- Roadmap: `context/foundation/roadmap.md` TD-09
- GitHub issue: #73
- Research: `context/changes/calendar-week-jump-picker/research.md`
- Related shipped work: `context/changes/calendar-week-transition-animation/plan.md` (TD-08 — direction/`goToWeek`-shaped navigation this plan extends)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Working picker — install, harden, wire

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Full build succeeds: `npm run build`
- [x] 1.4 Existing test suite still passes: `npm test`

#### Manual

- [x] 1.5 Clicking the week-range label opens a calendar popover
- [x] 1.6 Popover shows the current week's Monday as selected
- [x] 1.7 Picking any day (including mid-week) navigates to the correct Monday-starting week
- [x] 1.8 Manually-edited non-Monday `?week=` still renders the correct week
- [x] 1.9 Direction-aware slide + pending-feedback still work for the new navigation path
- [x] 1.10 Picking a date within the current week closes the popover with no errors or spurious animation
- [x] 1.11 Picker's calendar weeks start on Monday, matching CalendarGrid
- [x] 1.12 Clicking a specific date navigates to that exact date's week (no timezone off-by-one/week)

### Phase 2: Whole-week hover/focus highlight

#### Automated

- [ ] 2.1 Type checking passes: `npm run typecheck`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Full build succeeds: `npm run build`
- [ ] 2.4 Existing test suite still passes: `npm test`

#### Manual

- [ ] 2.5 Hovering any day highlights its entire week row
- [ ] 2.6 Keyboard-focusing any day highlights its entire week row
- [ ] 2.7 Highlight clears when pointer/focus leaves the calendar
- [ ] 2.8 No layout shift or visual glitch from the modifier styling
