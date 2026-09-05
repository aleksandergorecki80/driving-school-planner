# Calendar Week Jump Picker — Plan Brief

> Full plan: `context/changes/calendar-week-jump-picker/plan.md`
> Research: `context/changes/calendar-week-jump-picker/research.md`

## What & Why

Make the office calendar's week-range label clickable, opening a date picker so office staff can jump directly to an arbitrary week instead of only stepping one week at a time via Prev/Next (TD-09, GitHub issue #73).

## Starting Point

The week-range label (`formatWeekLabel()` in `WeeklyCalendar.tsx`) is plain, non-interactive text. No date-picker UI exists anywhere in the app — `calendar.tsx`/`popover.tsx` aren't installed, and no date library is a dependency. Research also surfaced a real correctness gap: `office/page.tsx`'s `getWeekStart()` only snaps to Monday on its no-param fallback — an explicit `?week=` value is used as-is, invisible today only because Prev/Next never produces a non-Monday value.

## Desired End State

Clicking the week-range label opens a calendar popover (current week's Monday pre-selected). Picking any day — even mid-week — closes the popover and jumps to that day's correct Monday-starting week, with the same direction-aware slide + instant click feedback Prev/Next already have (TD-08). Hovering or keyboard-focusing a day previews its whole week by highlighting the row.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Monday-snap location | Harden `getWeekStart()` server-side | Fixes correctness for any current or future caller of `?week=`, not just this picker — single source of truth | Plan |
| Picker interaction depth | Whole-week hover/focus highlight (not a plain single-date pick) | User chose the richer preview affordance over the simpler ship-faster option | Plan |
| Phase split | 2 phases: working picker, then hover/focus polish | The exact `react-day-picker` hover/focus API is only known after install — decouples "does it work" from "does it look great" | Plan |
| Test coverage | No new test file | Additive UI wiring over an already-tested `?week=` navigation mechanism | Plan |
| Confirm step | None — pick closes popover and navigates immediately | Matches this codebase's existing Select-like immediate-action UI | Plan |
| Date restriction | None — past weeks stay freely pickable | Matches existing unrestricted Prev/Next; TD-06's past-time block is booking-only, not navigation | Plan |

## Scope

**In scope:**
- Install shadcn `calendar` + `popover` (pulls in `react-day-picker`)
- Harden `getWeekStart()` to always snap to Monday
- New `WeekPicker.tsx` trigger + popover component
- Shared `goToWeek()` navigation path used by both Prev/Next and the picker
- Whole-week hover/focus highlight (Phase 2)

**Out of scope:**
- Restricting which dates can be picked
- A confirm/apply step before navigating
- New test file
- A shared `src/lib/date-utils.ts` module
- Any change to `AutoRefresh`, polling, or booking/creation logic

## Architecture / Approach

`WeekPicker` (new, client component) wraps shadcn's `Popover` + `Calendar` behind a ghost-button trigger showing the current week label. Its `onSelect` callback plugs into `WeeklyCalendar`'s new `goToWeek(newStart)` — extracted from TD-08's existing `navigateWeek` logic — so both Prev/Next and an arbitrary date pick share one direction-aware, pending-feedback navigation path. The picked date is passed raw to the `?week=` URL param; `office/page.tsx`'s hardened `getWeekStart()` is now the single place responsible for snapping any such value to its Monday.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Working picker | Install, `getWeekStart` hardening, trigger + popover + navigation, end to end | None significant — mostly wiring existing/new shadcn primitives together |
| 2. Whole-week hover/focus highlight | Visual preview of the target week before clicking | Exact `react-day-picker` day-hover/focus API only knowable post-install — must consult installed types, not assume an API shape |

**Prerequisites:** TD-08 (shipped) — this plan extends its `direction`/navigation mechanism directly.
**Estimated effort:** Two short sessions, one phase each.

## Open Risks & Assumptions

- Phase 2's exact hover/focus wiring depends on whichever `react-day-picker` version `npx shadcn add calendar` installs — flagged as a Critical Implementation Detail in the full plan; not a blocker, just something to confirm against the installed library's own types when Phase 2 starts.

## Success Criteria (Summary)

- Picking any day (including mid-week) always lands on the correct Monday-starting week.
- A hand-edited non-Monday `?week=` URL also resolves correctly.
- Prev/Next's existing slide animation and pending feedback are unaffected.
- Hovering/focusing a day previews its whole week before commit.
