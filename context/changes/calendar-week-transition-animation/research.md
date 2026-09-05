---
date: 2026-09-05T12:13:33Z
researcher: Claude
git_commit: 590460f935d36728b73e7767d2278c41e857998c
branch: main
repository: driving-school-planner
topic: "Transition animation for calendar week navigation (TD-08)"
tags: [research, codebase, calendar, animation, view-transitions, next-js]
status: complete
last_updated: 2026-09-05
last_updated_by: Claude
---

# Research: Transition animation for calendar week navigation (TD-08)

**Date**: 2026-09-05T12:13:33Z
**Researcher**: Claude
**Git Commit**: 590460f935d36728b73e7767d2278c41e857998c
**Branch**: main
**Repository**: driving-school-planner

## Research Question

`WeeklyCalendar`'s Prev/Next navigation swaps the visible week instantly via `router.push()` — no transition. What's the right way to add a subtle animation (slide/fade) on `CalendarGrid`'s content when the week changes, given this app's Next.js 16 App Router / Server Component data flow, and what does this codebase already have available for it?

## Summary

The week-navigation path is entirely client-driven props, not a remount: `WeeklyCalendar.tsx:47-52`'s `navigateWeek()` calls `router.push('/office?week=...')`, which causes the Server Component `office/page.tsx` to refetch `lessons`/`weekStart` and re-render — but `LessonPanel` → `WeeklyCalendar` → `CalendarGrid` are never given a `key` tied to `weekStart`, so React treats them as the same mounted instances across navigation and only their props change. Two viable approaches exist, and they trade off differently:

1. **React's `<ViewTransition>` (via Next.js's experimental `viewTransition` flag)** — the modern, declarative option, with a documented pattern for exactly this "Prev/Next directional navigation" use case. Requires opting in to an experimental Next.js flag (currently unset in this repo) and introduces a pattern (`<ViewTransition>`, `key`-based transitions) not used anywhere else in the codebase yet.
2. **Plain Tailwind CSS transition, keyed remount** — give the grid content a `key={weekStartStr}` to force a remount on week change, and animate the mount with `tw-animate-css` utility classes (`animate-in fade-in-0 slide-in-from-*`) or a direction-aware `transition-transform` — both idioms the codebase already uses everywhere else (shadcn/Base UI components, the archived Drawer slide-in). Zero new dependencies, zero new experimental flags, matches "no premature abstraction" project style.

No prior art in `context/changes/**` or `context/archive/**` discusses animations/transitions beyond what ships by default with the already-installed shadcn/Base UI/vaul components.

## Detailed Findings

### Data flow / component identity across week navigation

- `src/app/office/page.tsx:92` passes `weekStart={weekStart.toISOString().slice(0, 10)}` into `<LessonPanel>` (inside a `<Suspense>` with no `key`).
- `src/app/office/components/lesson-panel/LessonPanel.tsx:12,20,53` receives `weekStart` and forwards it unchanged into `<WeeklyCalendar weekStart={weekStart} ... />` — no `key`.
- `src/app/office/components/calendar/WeeklyCalendar.tsx:35,42-45` parses `weekStart` into a `Date` and derives a `days` array, then renders `<CalendarGrid days={days} lessons={lessons} .../>` — no `key`.
- `src/app/office/components/calendar/CalendarGrid.tsx:31` receives `days`/`lessons` as plain props.

**Conclusion**: no component in this chain remounts on week navigation today — React reconciles the same instances and only the `days`/`lessons` props change. Any animation approach must either (a) explicitly force a remount via `key={weekStartStr}` somewhere in this chain, or (b) animate purely from the prop change without remounting.

- `WeeklyCalendar.tsx:47-52` — `navigateWeek(delta)` builds the new `week` search param and calls `router.push(`/office?${params}`)`. This is a same-route App Router navigation (URL search param change only), which re-invokes `office/page.tsx` server-side and streams new props down — not a full page reload, not a route change in the Next.js sense.

### Next.js 16 View Transitions API

- Confirmed present in the installed `next@16.2.6` package docs: `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` and `.../03-api-reference/05-config/01-next-config-js/viewTransition.md` (status: `experimental`).
- Requires an explicit opt-in: `experimental: { viewTransition: true }` in `next.config.ts`. **Not currently set** — `next.config.ts` at the repo root has no `experimental` block at all (just `withSentryConfig(nextConfig, {...})`).
- The `<ViewTransition>` component itself is exported by **React**, not Next — the Next flag only wires up "triggering transitions during route navigations."
- The guide's own "directional motion for navigation" example is structurally the closest match to this task (Prev/Next buttons): tag navigation triggers with `transitionTypes={['nav-forward']}`/`['nav-back']`, wrap content in `<ViewTransition enter={...} exit={...} default="none">` mapping transition types to `::view-transition-old/new(...)` CSS animations. That pattern is documented for `<Link>`; the guide states `useRouter()`'s `push()`/`replace()` "also support `transitionTypes`" — directly applicable since `navigateWeek()` already calls `router.push()`.
- Caveats from the doc: Safari behaves differently; regular `setState` does **not** trigger `<ViewTransition>` (only Transitions/`<Suspense>`/`useDeferredValue` — route navigations qualify automatically); reduced-motion requires manual `@media (prefers-reduced-motion: reduce)` overrides zeroing `::view-transition-*` durations; App Router only.

### Existing animation conventions in this codebase

- `package.json:42` — `tw-animate-css@^1.4.0` is installed and imported at `src/app/globals.css:2` (alongside `@import "tailwindcss"`). This is the `tailwindcss-animate` successor, providing utility classes like `animate-in`, `animate-out`, `fade-in-0`, `fade-out-0`, `zoom-in-95`.
- No hand-written `@keyframes` anywhere in `globals.css` — all animation in this project goes through `tw-animate-css` utilities.
- The house pattern, used consistently across shadcn/Base UI components in `src/components/ui/*.tsx`, is data-attribute-driven: `data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0` (e.g. `drawer.tsx:40`, `alert-dialog.tsx:33,56`). These key off state attributes emitted by the underlying primitives (`vaul` for Drawer, `@base-ui/react` for AlertDialog/Select/etc., per `package.json:26`).
- The other established idiom — used for the original Drawer slide-in per `context/archive/2026-06-28-office-books-lesson/plan.md:304` — is plain Tailwind `transition-transform` + conditional class toggling (`translate-x-0` open / `translate-x-full` closed), no state-attribute library needed.
- No `framer-motion` or `motion/react` dependency anywhere (`package.json`, full `src/` grep — zero hits).

### Prior art in context/changes and context/archive

- No prior discussion of transitions/animations for this or any other feature beyond what ships by default with already-installed shadcn/Base UI/vaul components.
- Only unrelated hits for "transition": React 19's `useTransition` (pending-state hook, unrelated to View Transitions API) in `instructor-responds/plan.md` and the archived Drawer's `transition-transform` styling (same file quoted above).

## Code References

- `src/app/office/page.tsx:92` — `weekStart` passed into `LessonPanel`, no `key`
- `src/app/office/components/lesson-panel/LessonPanel.tsx:12,20,53` — pass-through, no `key`
- `src/app/office/components/calendar/WeeklyCalendar.tsx:35,42-52,84-89` — `weekStart` parsing, `navigateWeek()`, `CalendarGrid` render (no `key`)
- `src/app/office/components/calendar/CalendarGrid.tsx:31` — grid render, plain props
- `src/app/globals.css:2` — `tw-animate-css` import
- `src/components/ui/drawer.tsx:40`, `src/components/ui/alert-dialog.tsx:33,56` — `data-open:animate-in`/`data-closed:animate-out` convention
- `next.config.ts` — no `experimental` block currently
- `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` — View Transitions guide (experimental)
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/viewTransition.md` — config flag reference

## Architecture Insights

- This codebase's animation convention is entirely Tailwind-utility-based (`tw-animate-css` + conditional classes), never a JS animation library and never hand-written keyframes — any new animation should follow this, not introduce `framer-motion` or lean on React's `<ViewTransition>` as a first choice, unless there's a specific reason the simpler idiom can't achieve the desired effect.
- The week-navigation data flow is a Server Component re-render (via URL search params), not a client-side route change — `<ViewTransition>`/experimental `viewTransition` targets *route* navigations; since `/office` is the same route with only a search param changing, its applicability here is less certain than the guide's canonical example (distinct routes) and would need direct verification (e.g. a spike) before committing to it.
- No component in the `page.tsx` → `LessonPanel` → `WeeklyCalendar` → `CalendarGrid` chain remounts on week change today — a `key={weekStartStr}` would need to be introduced to drive either a remount-and-animate-in approach, or a directional variant needs the previous week's content to persist briefly during a crossfade (more complex, requires holding onto old props during a transition-out).

## Historical Context (from prior changes)

- `context/archive/2026-06-28-office-books-lesson/plan.md:304` — the original Drawer slide-in used plain `transition-transform` + `translate-x-full`/`translate-x-0` toggling, no library. This is the most directly comparable prior decision in this codebase for "how do we animate a UI transition here."

## Related Research

- None — no prior research.md exists for animation/transition topics.

## Open Questions

- Does the experimental `viewTransition` flag's Next.js route-navigation integration actually fire for a same-route search-param-only navigation (`/office?week=X` → `/office?week=Y`), or only for distinct-route navigations? The guide's examples are all cross-route; this needs a direct spike/test if that approach is chosen.
- Should the animation be direction-aware (slide left for Next, right for Prev) or a simple fade regardless of direction? Affects whether `navigateWeek()` needs to pass a direction signal down to the grid.
