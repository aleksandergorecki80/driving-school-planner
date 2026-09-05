# Past Slot Click Feedback Implementation Plan

## Overview

Give the office user a transient message ("Cannot schedule a lesson in the past") when they click a disabled past-time slot in the office weekly calendar, instead of the current silent no-op. Follow-up to TD-06 (roadmap `no-past-lesson-scheduling`), which deliberately shipped the click-level block without any feedback.

## Current State Analysis

`CalendarGrid.tsx` (`src/app/office/components/calendar/CalendarGrid.tsx:59-75`) renders one empty `<div>` per slot cell. For a slot whose time has already passed, `onClick` is set to `undefined` and the cell's className includes `aria-disabled:pointer-events-none` — which, in a real browser, prevents the click (and hover) event from ever reaching the element. The existing test (`CalendarGrid.test.tsx`) only verifies the JS-level guard (`onSlotClick` not called); `fireEvent.click` in jsdom doesn't apply CSS, so the `pointer-events-none` gap is invisible to that test.

No toast/snackbar library exists anywhere in the project yet. shadcn/ui is configured (`components.json`, style `base-nova`) and already has an unused `Tooltip` primitive (`src/components/ui/tooltip.tsx`) but no toast component. `next-themes` is already wired in `src/components/theme-provider.tsx` and mounted in `src/app/layout.tsx`, so a shadcn-generated toast component will pick up the app's light/dark theme automatically.

A canonical user-facing string for this exact condition already exists server-side: `'Cannot schedule a lesson in the past'` (`src/app/actions/lessons/createLesson.ts:22`, mapped from `PastScheduledAtError` in `src/domain/lesson/Lesson.ts`). Reuse it verbatim for wording consistency between the client-side click guard and the server-side rejection message.

## Desired End State

Clicking a disabled past slot in the office calendar shows a toast reading "Cannot schedule a lesson in the past" in the corner of the screen, themed correctly in both light and dark mode. Clicking several past slots in a row replaces/resets the same toast rather than stacking duplicates. Clicking a future slot is unaffected (still opens the booking panel via `onSlotClick`). Verify by running the app, navigating to a week containing today, and clicking a past slot.

### Key Discoveries:

- `CalendarGrid.tsx:70` — `aria-disabled:pointer-events-none` blocks the click event itself in real browsers; the JS-level `onClick={isPast ? undefined : ...}` guard is the only thing the current test actually exercises.
- `createLesson.ts:22` — reuse `'Cannot schedule a lesson in the past'` verbatim for the toast message.
- `layout.tsx` already wraps `children` in `next-themes`' `ThemeProvider`, so a shadcn `sonner` Toaster mounted there is theme-aware for free.

## What We're NOT Doing

- Not adding keyboard/focus handling to calendar slot cells (they're plain, non-focusable `<div>`s today; out of scope, unrelated to this change).
- Not touching `LessonBlock` or past lessons that already have a booking — this only affects empty past slot cells.
- Not building a custom toast component or reusing the existing `Tooltip` primitive — see plan brief for the rejected alternatives.

## Implementation Approach

Install shadcn's `sonner`-based toast component (one CLI command) and mount its `<Toaster />` once in the root layout. Then, in `CalendarGrid`, stop relying on `pointer-events-none` to suppress past-slot interaction — remove it so the click event actually reaches the cell in a real browser — and replace the `undefined` onClick for past slots with a handler that fires the toast (using a stable id so repeat clicks reset rather than stack the same message).

## Phase 1: Toast infrastructure

### Overview

Add the toast component and wire it into the app shell so any client component can call `toast(...)`.

### Changes Required:

#### 1. Install shadcn sonner component

**File**: `src/components/ui/sonner.tsx` (generated), `package.json` (new `sonner` dependency)

**Intent**: Add the shadcn-blessed toast primitive, which wraps `sonner`'s `Toaster` with `next-themes`' `useTheme()` so it renders correctly in both themes.

**Contract**: Run `npx shadcn@latest add sonner`. Generates `src/components/ui/sonner.tsx` exporting a `Toaster` component; adds `sonner` to `package.json` dependencies.

#### 2. Mount the Toaster

**File**: `src/app/layout.tsx`

**Intent**: Render one global `<Toaster />` instance so `toast()` calls from anywhere in the client tree are visible.

**Contract**: Import `Toaster` from `@/components/ui/sonner` and render it inside `<ThemeProvider>`, alongside `{children}`, so it shares the same theme context.

### Success Criteria:

#### Automated Verification:

- [ ] Typecheck passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:

- [ ] `npm run dev` boots without hydration or console errors after the `<Toaster />` mount

---

## Phase 2: CalendarGrid click feedback + tests

### Overview

Wire the actual click-to-toast behavior into the calendar grid and extend the existing test file to cover it.

### Changes Required:

#### 1. Past-slot click handler

**File**: `src/app/office/components/calendar/CalendarGrid.tsx`

**Intent**: Replace the past-slot no-op with a handler that shows the reused error message as a toast, and make the cell reachable by a real click by dropping `pointer-events-none`.

**Contract**:
- Import `toast` from `sonner`.
- `onClick` becomes unconditional: `isPast` routes to a `handlePastSlotClick` that calls `toast('Cannot schedule a lesson in the past', { id: 'past-slot-click' })`; otherwise call `onSlotClick(slotDate)` as today. The stable `id` makes sonner replace/reset any currently-visible instance of this toast on repeat clicks instead of stacking duplicates.
- Remove `pointer-events-none` from the `aria-disabled` variant classes on the slot cell; keep `aria-disabled:cursor-not-allowed`, `aria-disabled:opacity-50`, and `aria-disabled:hover:bg-transparent` (the last one already suppresses the `hover:bg-accent` rule, so the cell keeps its disabled look — no hover highlight — once it's actually reachable by the mouse).

#### 2. Extend test coverage

**File**: `src/app/office/components/calendar/CalendarGrid.test.tsx`

**Intent**: Cover the new feedback path alongside the existing guard assertions.

**Contract**: Mock the `sonner` module's `toast` export. Add a case asserting that clicking a past slot calls `toast('Cannot schedule a lesson in the past', { id: 'past-slot-click' })` (and still does not call `onSlotClick`), and a case asserting `toast` is NOT called when clicking a future slot.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm run test`
- [ ] Typecheck passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:

- [ ] In the office calendar, clicking a past slot shows the "Cannot schedule a lesson in the past" toast, correctly styled in both light and dark mode
- [ ] Clicking several past slots in a row shows/resets a single toast rather than stacking duplicates
- [ ] Clicking a future slot still opens the new-lesson panel as before (no regression)

---

## Testing Strategy

### Unit Tests:

- Past slot click → `toast()` called with the exact message and stable id; `onSlotClick` not called (extends existing test).
- Future slot click → `onSlotClick` called; `toast()` not called.

### Manual Testing Steps:

1. Run `npm run dev`, log in as office, open a week containing today.
2. Click a past slot → toast appears with "Cannot schedule a lesson in the past".
3. Click several more past slots quickly → only one toast instance visible at a time.
4. Toggle dark mode → re-trigger the toast, confirm it's legible/themed correctly.
5. Click a future slot → new-lesson panel opens as before.

## References

- Roadmap: `context/foundation/roadmap.md` TD-07
- GitHub issue: #71
- Prior related work: `context/changes/no-past-lesson-scheduling/plan.md` (TD-06, the click-guard this change adds feedback to)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Toast infrastructure

#### Automated

- [x] 1.1 Typecheck passes: `npm run typecheck`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Build succeeds: `npm run build`

#### Manual

- [ ] 1.4 `npm run dev` boots without hydration or console errors after the `<Toaster />` mount

### Phase 2: CalendarGrid click feedback + tests

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test`
- [ ] 2.2 Typecheck passes: `npm run typecheck`
- [ ] 2.3 Lint passes: `npm run lint`

#### Manual

- [ ] 2.4 Clicking a past slot shows the toast, correctly styled in both light and dark mode
- [ ] 2.5 Clicking several past slots in a row shows/resets a single toast rather than stacking duplicates
- [ ] 2.6 Clicking a future slot still opens the new-lesson panel as before (no regression)
