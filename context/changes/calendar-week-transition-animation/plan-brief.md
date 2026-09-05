# Calendar Week Transition Animation — Plan Brief

> Full plan: `context/changes/calendar-week-transition-animation/plan.md`
> Research: `context/changes/calendar-week-transition-animation/research.md`

## What & Why

Add a subtle, direction-aware slide/fade animation to the office calendar when navigating between weeks — today Prev/Next swaps the visible week instantly with no transition (TD-08, GitHub issue #72).

## Starting Point

`WeeklyCalendar`'s Prev/Next buttons call `router.push('/office?week=...')`, which re-invokes the Server Component `office/page.tsx` to refetch `lessons`/`weekStart`. No component in the render chain has a `key` tied to `weekStart`, so React reuses the same `WeeklyCalendar`/`CalendarGrid` instances across navigation — the swap is a prop change, not a remount.

## Desired End State

Clicking Next slides the new week's grid in from the right with a brief fade; clicking Prev slides in from the left. The 30-second `AutoRefresh` poll never replays this animation (it refreshes `lessons` for the same week, not the week itself). Users with `prefers-reduced-motion` see an instant swap, no animation.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Animation approach | Tailwind (`tw-animate-css`) + keyed remount | Matches the codebase's only existing animation idiom (used by every shadcn/Base UI component); zero new dependencies, zero experimental Next.js flags | Plan |
| Next.js View Transitions | Rejected | Experimental, unproven for same-route search-param-only navigation, and would introduce a pattern used nowhere else in this codebase | Research |
| Direction awareness | Slide-in from the side matching Prev/Next | Maps naturally onto "moving forward/backward through time"; the utility classes for it already exist in `tw-animate-css` | Plan |
| Remount key scope | Keyed on `weekStart`, not `lessons` | `AutoRefresh` polls `lessons` every 30s on the same week — keying on `lessons` would incorrectly replay the animation on every poll tick | Plan |
| Test coverage | No new test file | Pure CSS/class-string change with no new logic beyond a conditional; matches project convention of not test-covering low-blast-radius static UI | Plan |

## Scope

**In scope:**
- Direction state (`forward`/`backward`) tracked in `WeeklyCalendar`, set in `navigateWeek()`
- `key={weekStart}` on `CalendarGrid` to scope the remount to week changes only
- Conditional `tw-animate-css` slide/fade-in classes on `CalendarGrid`'s root, respecting `motion-reduce:`
- `overflow-x-hidden` added to the scroll container to prevent a transient horizontal scrollbar

**Out of scope:**
- Next.js experimental View Transitions API
- Cross-fade between old and new content simultaneously (this is remount-and-animate-in only)
- Any change to `AutoRefresh`, polling, or data-fetching in `office/page.tsx`
- New test file

## Architecture / Approach

`WeeklyCalendar` tracks the last navigation direction as state, set immediately before `router.push()`. `CalendarGrid` receives that direction plus a `key` tied to `weekStart` — the key forces React to unmount/remount `CalendarGrid` only when the week actually changes (not on `AutoRefresh`'s `lessons`-only refetch), and the remount triggers `tw-animate-css`'s `animate-in` entrance classes, varied by direction (`slide-in-from-right-4` vs `slide-in-from-left-4`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Direction-aware keyed transition | Direction state + keyed remount + conditional entrance classes, end to end | Scroll-container horizontal overflow during the slide transform if `overflow-x-hidden` is missed |

**Prerequisites:** None — purely additive to existing, shipped calendar UI.
**Estimated effort:** Single short session, one phase.

## Open Risks & Assumptions

- None outstanding — approach, direction handling, and the poll-vs-navigation distinction were all resolved during planning; no unresolved technical unknowns remain.

## Success Criteria (Summary)

- Next/Prev clicks produce a direction-correct slide+fade; the 30s poll never replays it.
- No layout shift or scrollbar flash during the transition.
- Users with reduced-motion preference see no animation.
