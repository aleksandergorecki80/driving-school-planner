---
date: 2026-09-05T13:03:13Z
researcher: Claude
git_commit: 49d11750b006b6a120563918a94f1406659cbdf0
branch: main
repository: driving-school-planner
topic: "Date picker to jump to an arbitrary week (TD-09)"
tags: [research, codebase, calendar, shadcn, date-picker]
status: complete
last_updated: 2026-09-05
last_updated_by: Claude
---

# Research: Date picker to jump to an arbitrary week (TD-09)

**Date**: 2026-09-05T13:03:13Z
**Researcher**: Claude
**Git Commit**: 49d11750b006b6a120563918a94f1406659cbdf0
**Branch**: main
**Repository**: driving-school-planner

## Research Question

The office calendar's week-range label (`formatWeekLabel()` in `WeeklyCalendar.tsx`) is plain non-interactive text — the only navigation is stepping one week at a time via Prev/Next. What's needed to make it clickable and open a date-picker to jump directly to an arbitrary week?

## Summary

No date-picker infrastructure exists in this codebase today — `calendar.tsx`/`popover.tsx` aren't installed (Popover was previously installed-but-dead and deliberately deleted during `shadcn-design-refresh`), and no date library (`react-day-picker`, `date-fns`) is present anywhere in `node_modules`. Adding this feature means `npx shadcn add calendar popover`, pulling in `react-day-picker` (+ likely `date-fns`) as new dependencies. The good news: `WeeklyCalendar` renders outside any vaul `Drawer` (it's a sibling of `LessonPanel`'s `Drawer`, not a descendant), so none of TD-05's portal-race workarounds apply — a default `document.body`-portaled Popover is safe here. One real correctness gap surfaced: `office/page.tsx`'s `getWeekStart()` only snaps to Monday on its no-param fallback path — an explicit `?week=` value is used verbatim with no Monday-snap. Since a date picker lets the user pick *any* day of the week (not just Mondays), this snap-to-Monday logic must be added somewhere before this feature can work correctly.

## Detailed Findings

### shadcn Calendar/Popover component status

- `src/components/ui/` has no `calendar.tsx` or `popover.tsx` today.
- No date library (`react-day-picker`, `date-fns`, `dayjs`, `moment`) is a real app dependency — the only `luxon` present in `node_modules` is a transitive dependency of the `vercel` CLI devDependency, not usable app-side.
- `components.json` is a plain default shadcn config (`style: "base-nova"`, `baseColor: "neutral"`, no custom registry) — `npx shadcn add calendar popover` would work with standard defaults.
- `Popover` was previously installed and **deliberately deleted** during `shadcn-design-refresh` (`context/changes/shadcn-design-refresh/plan.md:39-40,115-117`) because "no legitimate anchored-floating-popover use case exists in this app" at the time. This feature is exactly that missing use case.

### Portal/Drawer nesting

- `WeeklyCalendar` is rendered as a **sibling** of `LessonPanel`'s `Drawer`, not nested inside it: `LessonPanel.tsx:49-73` renders `<WeeklyCalendar>` at line 50, then a separate `<Drawer>...<DrawerContent>` block at lines 58-73 for `NewLessonForm`/`LessonPopover`.
- The full chain (`office/page.tsx:89-96` → `LessonPanel.tsx:50`) never places `WeeklyCalendar` inside any vaul `Drawer` context.
- **Conclusion**: TD-05's portal-container workaround (pointing a popup's `container` at a local root div, used in `NewLessonForm.tsx`/`LessonPopover.tsx`) is not needed here — a Calendar/Popover triggered from the week-range label can use shadcn's default `document.body` portal safely.

### Existing date-math utilities

- `office/page.tsx:18-27`'s `getWeekStart()` only computes Monday-of-week on its no-`week`-param fallback (lines 23-26); an explicit `?week=` value (lines 19-21) is parsed and used as-is, with no validation that it's actually a Monday.
- `WeeklyCalendar.tsx:17-31` has its own file-local `parseWeekStart`/`toISODate`/`formatWeekLabel` helpers — not shared/exported.
- No shared date-utility module exists anywhere in `src/lib` (`format-lesson-datetime.ts` is unrelated — scheduled-datetime formatting, not week/Monday math).
- **Gap**: today the only way `week` gets set is via `navigateWeek()`, which always adds/subtracts exactly 7 days from an already-Monday-aligned `weekStart` — so it can never produce a non-Monday value in practice. A date picker breaks that invariant: the user can pick *any* day. Whatever date they pick must be snapped to that week's Monday before being written into the `?week=` param, or `getWeekStart()` itself must snap unconditionally regardless of source.

### Prior art

- `context/changes/shadcn-design-refresh/research.md`/`plan.md` — documents the Popover install-then-delete history (see above); no mention of a Calendar component or date picker anywhere in that change, since it predates this feature.
- No other mentions of a date picker or Calendar component anywhere in `context/changes/**` or `context/archive/**`.

## Code References

- `src/app/office/components/calendar/WeeklyCalendar.tsx:17-31` — `parseWeekStart`/`toISODate`/`formatWeekLabel` helpers (file-local)
- `src/app/office/components/calendar/WeeklyCalendar.tsx:68-72` — the week-range label `<span>` to make clickable
- `src/app/office/page.tsx:18-27` — `getWeekStart()`, only snaps to Monday on the no-param fallback path
- `src/app/office/components/lesson-panel/LessonPanel.tsx:49-73` — confirms `WeeklyCalendar` sits outside the `Drawer`
- `components.json` — shadcn config, no custom registry
- `context/changes/shadcn-design-refresh/plan.md:39-40,115-117` — Popover install-then-delete rationale

## Architecture Insights

- This codebase adds shadcn components lazily, only when a real use case exists (Popover was removed for lack of one) — installing `calendar`/`popover` now is consistent with that discipline, not a violation of it.
- Small date helpers are consistently kept file-local rather than centralized in `src/lib` — extracting a shared "snap to Monday" helper here would be the first departure from that pattern; whether that's worth it (one new caller today, `getWeekStart` on the server plus the picker's onSelect handler on the client) is a real but small decision for the plan step.
- The date picker needs to hand off a plain `YYYY-MM-DD` string to the same `router.push('/office?week=...')` mechanism already used by `navigateWeek()` — no new navigation primitive needed, only a new *trigger* for the same URL-param-based navigation.

## Historical Context (from prior changes)

- `context/changes/shadcn-design-refresh/plan.md` — Popover was deleted for lack of a use case; this feature reinstates it for its first real one.

## Related Research

- `context/changes/calendar-week-transition-animation/research.md` — same `WeeklyCalendar.tsx`/`office/page.tsx` files, covers the Prev/Next transition animation (TD-08, shipped) — complementary, not overlapping (that research didn't touch the week-range label or date-picking).

## Open Questions

- Should the picked date snap to Monday client-side (in the picker's `onSelect` handler, before building the `?week=` URL) or should `office/page.tsx`'s `getWeekStart()` be hardened to always snap any `week` param to Monday regardless of source? The latter is more robust (fixes correctness for any future caller of the `week` param, e.g. a manually-edited URL) but touches a file outside `WeeklyCalendar`'s own component tree — a decision for the plan step, not blocking further research.
