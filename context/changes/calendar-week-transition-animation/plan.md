# Calendar Week Transition Animation Implementation Plan

## Overview

Add a subtle, direction-aware slide/fade transition to the office calendar grid when the user navigates between weeks via Prev/Next — today the swap is instant with no visual feedback (TD-08, GitHub issue #72).

## Current State Analysis

- `WeeklyCalendar.tsx:47-52`'s `navigateWeek(delta)` builds a new `week` search param and calls `router.push('/office?week=...')`. This re-invokes the Server Component `office/page.tsx`, which refetches `lessons`/`weekStart` and streams new props down.
- No component in the chain — `page.tsx` → `LessonPanel` → `WeeklyCalendar` → `CalendarGrid` — has a `key` tied to `weekStart`, so React reconciles the same mounted instances across navigation; only `days`/`lessons` props change (confirmed in `research.md` "Component identity across navigation").
- The project's established animation idiom is Tailwind-utility-based: `tw-animate-css` (`package.json:42`, imported at `globals.css:2`) provides `animate-in`/`animate-out`, `fade-in-0`/`fade-out-0`, and `slide-in-from-{left,right,top,bottom}[-N]` classes, used throughout `src/components/ui/*.tsx` (e.g. `drawer.tsx:40`, `alert-dialog.tsx:33,56`) via a `data-open:animate-in ...` pattern. No JS animation library (`framer-motion`, etc.) exists in this codebase.
- `AutoRefresh` (per S-02) polls `router.refresh()` every 30 seconds on the office page to keep lesson status current — this refetches `lessons` for the *same* `weekStart`, so any remount trigger must be scoped to `weekStart` changes only, not `lessons` changes, or the slide/fade would incorrectly replay on every poll tick.

## Desired End State

Clicking Prev or Next on the office calendar produces a brief (~200ms), direction-aware slide-plus-fade of the grid content — sliding in from the right for Next (moving forward in time), from the left for Prev (moving backward) — respecting `prefers-reduced-motion`. The 30-second background poll (`AutoRefresh`) never triggers this animation. Initial page load (no prior navigation) shows the grid with no animation.

### Key Discoveries:

- `WeeklyCalendar.tsx:84-89` renders `<CalendarGrid days={days} lessons={lessons} .../>` with no `key` — adding `key={weekStartStr}` here forces exactly the remount needed, scoped to week changes only (not `lessons`-only changes from polling).
- The grid's scroll container (`WeeklyCalendar.tsx:83`, `<div className="flex-1 overflow-y-auto">`) only clips vertically — a horizontal slide transform on its child needs `overflow-x-hidden` added alongside the existing `overflow-y-auto`, or the transform will produce a transient horizontal scrollbar/content shift during the animation.
- `tw-animate-css` ships `slide-in-from-left-4`/`slide-in-from-right-4`-style utilities (confirmed via `node_modules/tw-animate-css/dist/tw-animate.css`) and Tailwind's built-in `motion-reduce:` variant needs no extra config — both can be composed directly as conditional class strings.

## What We're NOT Doing

- Not using Next.js's experimental `viewTransition` flag / React `<ViewTransition>` — unproven for same-route search-param-only navigation, and would introduce a new pattern (and an experimental flag) not used anywhere else in this codebase.
- Not adding a new test file — this is a pure visual/CSS change (conditional class strings + a `key`), consistent with the project's "don't test static/low-blast-radius UI" convention (`test-plan.md` §7). A broken prop/type would already fail `npm run typecheck`.
- Not animating cross-fade between old and new content simultaneously (no two grids visible at once) — this is a remount-and-animate-in of the new grid only, matching the codebase's existing enter/exit idiom (mount = animate in, no exit animation needed since the old content is simply gone once the new one mounts).
- Not changing anything about `AutoRefresh`, the polling mechanism, or the underlying data-fetching in `office/page.tsx`.

## Implementation Approach

Track the last navigation direction as component state in `WeeklyCalendar` (set right before `router.push`), then key `CalendarGrid` on `weekStartStr` to force a scoped remount, and apply direction-conditional `tw-animate-css` utility classes to `CalendarGrid`'s root element so the entering grid slides in from the correct side.

## Phase 1: Direction-aware keyed transition

### Overview

Add direction tracking to `WeeklyCalendar`, key `CalendarGrid` on the week so only week changes (not polling) trigger a remount, and apply conditional slide/fade-in classes on mount.

### Changes Required:

#### 1. Track navigation direction and key the grid

**File**: `src/app/office/components/calendar/WeeklyCalendar.tsx`

**Intent**: Remember which way the user just navigated (Prev = backward, Next = forward) so the entering grid can slide in from the matching side, and force `CalendarGrid` to remount only when the week itself changes.

**Contract**: Add `const [direction, setDirection] = useState<'forward' | 'backward' | null>(null)`. In `navigateWeek(delta)`, call `setDirection(delta > 0 ? 'forward' : 'backward')` before `router.push(...)`. Pass `key={weekStartStr}` and `direction={direction}` to `<CalendarGrid>`. Add `overflow-x-hidden` to the scroll container `<div>` at line 83 (alongside the existing `overflow-y-auto`).

#### 2. Apply direction-conditional entrance animation

**File**: `src/app/office/components/calendar/CalendarGrid.tsx`

**Intent**: Animate the grid's entrance when it remounts (i.e., on a real week change), sliding from the side matching the navigation direction, respecting reduced-motion preference. No animation on the very first mount (`direction` is `null`).

**Contract**: Extend `Props` with `direction?: 'forward' | 'backward' | null`. Compute a class string appended to the root `<div>` (currently `"grid w-full"`, line 33-38): when `direction` is non-null, add `motion-reduce:animate-none animate-in fade-in-0 duration-200` plus `slide-in-from-right-4` (forward) or `slide-in-from-left-4` (backward); add nothing extra when `direction` is `null`.

#### 3. Immediate pending feedback on click

**Added mid-phase** (found during manual verification 2026-09-05): the `router.push()` navigation is a Server Component round-trip — nothing visible happens until it resolves, which can take close to a second. The entrance animation only fires once the new content arrives, so a click gave no immediate sense that it registered. Fixed by wrapping the navigation in a `useTransition`, following the exact `isPending`/`disabled` pattern already used in `NewLessonForm.tsx:38,124` and `LessonPopover.tsx:33,143`.

**File**: `src/app/office/components/calendar/WeeklyCalendar.tsx`

**Intent**: Give the user instant visual feedback the moment they click Prev/Next, before the server round-trip resolves.

**Contract**: Add `const [isPending, startTransition] = useTransition()`. Wrap the `router.push(...)` call inside `navigateWeek` in `startTransition(() => { ... })`. Add `disabled={isPending}` to both Prev and Next `<Button>`s (existing `disabled:opacity-50` styling on `Button` already dims them).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Full build succeeds: `npm run build`
- Existing test suite still passes: `npm test`

#### Manual Verification:

- Clicking Next slides the new week's grid in from the right with a brief fade; clicking Prev slides in from the left.
- Initial page load (selecting an instructor for the first time) shows the grid with no animation.
- Waiting through one `AutoRefresh` poll cycle (30s) on the same week does NOT replay the slide/fade animation.
- No transient horizontal scrollbar or layout shift appears during the animation.
- With OS-level "reduce motion" enabled, navigating Prev/Next shows the new week instantly with no slide/fade.
- Rapidly clicking Next multiple times in a row does not visually glitch or leave the grid in a half-animated state.
- Clicking Prev/Next immediately (synchronously, before the new week loads) disables and dims both buttons, giving instant feedback that the click registered.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None added (see What We're NOT Doing) — existing type-checking and lint gates cover the wiring correctness for this change.

### Manual Testing Steps:

1. Open `/office`, select an instructor — confirm the initial grid render has no animation.
2. Click Next several times — confirm each transition slides in from the right.
3. Click Prev several times — confirm each transition slides in from the left.
4. Leave the page open on one week for 30+ seconds (past one `AutoRefresh` poll) — confirm no animation replays.
5. Enable "reduce motion" in OS accessibility settings, repeat steps 2-3 — confirm no animation plays.
6. Resize the browser narrow enough to be near the grid's width, then navigate — confirm no horizontal scrollbar appears during the transition.

## Performance Considerations

None — pure CSS transform/opacity animation on an already-rendered subtree; no additional data fetching or JS animation loop.

## Migration Notes

None — no schema or data changes.

## References

- Roadmap: `context/foundation/roadmap.md` TD-08
- GitHub issue: #72
- Research: `context/changes/calendar-week-transition-animation/research.md`
- Existing convention: `src/components/ui/drawer.tsx:40`, `src/components/ui/alert-dialog.tsx:33,56`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Direction-aware keyed transition

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — 8e4b70f
- [x] 1.2 Linting passes: `npm run lint` — 8e4b70f
- [x] 1.3 Full build succeeds: `npm run build` — 8e4b70f
- [x] 1.4 Existing test suite still passes: `npm test` — 8e4b70f

#### Manual

- [x] 1.5 Next slides in from the right, Prev slides in from the left — 8e4b70f
- [x] 1.6 Initial grid render has no animation — 8e4b70f
- [x] 1.7 AutoRefresh poll cycle does not replay the animation — 8e4b70f
- [x] 1.8 No transient horizontal scrollbar/layout shift during the animation — 8e4b70f
- [x] 1.9 `prefers-reduced-motion` disables the animation entirely — 8e4b70f
- [x] 1.10 Rapid repeated Next/Prev clicks do not glitch or leave a half-animated state — 8e4b70f
- [x] 1.11 Prev/Next buttons disable/dim immediately on click, before the new week loads — 8e4b70f
