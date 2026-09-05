# Past Slot Click Feedback — Plan Brief

> Full plan: `context/changes/past-slot-click-feedback/plan.md`

## What & Why

Clicking a disabled past-time slot in the office calendar is currently a silent no-op — a deliberate scope decision in TD-06, but it reads as the app being unresponsive. This change adds a toast message ("Cannot schedule a lesson in the past") so the click gets visible feedback. GitHub issue #71.

## Starting Point

`CalendarGrid.tsx` sets `onClick={undefined}` for past slots and relies on CSS `aria-disabled:pointer-events-none` to visually suppress them — but that CSS rule also blocks the click event from ever reaching the element in a real browser, which the existing jsdom test can't catch (jsdom ignores CSS). No toast/snackbar library exists in the project yet.

## Desired End State

Clicking a past slot shows a themed toast reading "Cannot schedule a lesson in the past" (reusing the exact wording the server already uses for the same rejection). Repeat clicks reset the same toast instead of stacking. Future-slot clicks are unaffected.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Feedback mechanism | Toast via shadcn's `sonner` component | Purpose-built for transient action feedback, one CLI install, no custom timeout/state logic needed |
| Placement | Global corner toast | Simple, consistent, unaffected by scroll position in the grid |
| Repeat clicks | Reset/replace the same toast (stable `id`) | Avoids stacking duplicate toasts if the user clicks several past slots quickly |
| Message wording | Reuse `'Cannot schedule a lesson in the past'` from `createLesson.ts` | Keeps client-side and server-side rejection wording identical |
| Test coverage | Extend `CalendarGrid.test.tsx` | Keeps regression coverage for both the guard and the new feedback in one file |

## Scope

**In scope:**
- Installing and mounting a shadcn toast component (`sonner`)
- Wiring a click handler + toast for disabled past slots in `CalendarGrid`
- Removing the `pointer-events-none` CSS that currently blocks the click event itself
- Extending `CalendarGrid.test.tsx`

**Out of scope:**
- Keyboard/focus accessibility for calendar cells (unrelated pre-existing gap)
- Any change to lesson blocks or already-booked past lessons
- A custom-built toast component or repurposing the existing `Tooltip` primitive

## Architecture / Approach

Two small, sequential phases: (1) install the toast primitive and mount it once at the app root so it's available anywhere in the client tree; (2) in `CalendarGrid`, drop the CSS that silently blocks the click event, and swap the past-slot no-op for a `toast()` call using a stable id.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Toast infrastructure | `sonner` installed, `<Toaster />` mounted in root layout | Low — additive, no existing behavior touched |
| 2. CalendarGrid click feedback + tests | Toast fires on past-slot click, tests updated | Removing `pointer-events-none` must not reintroduce a hover-highlight regression on disabled cells |

**Prerequisites:** None — no dependencies on other in-flight work.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Assumes `aria-disabled:hover:bg-transparent` (already present in the className) is sufficient to suppress the hover-accent highlight once `pointer-events-none` no longer blocks mouse hover on disabled cells — flagged as a manual-verification item in Phase 2.

## Success Criteria (Summary)

- Office user clicking a past slot sees a clear, correctly-themed toast instead of nothing happening.
- No regression to future-slot booking or to already-booked lesson blocks.
