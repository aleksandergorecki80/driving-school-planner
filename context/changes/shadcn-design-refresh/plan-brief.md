# Align UI with shadcn/ui blocks + wire up dark mode — Plan Brief

> Full plan: `context/changes/shadcn-design-refresh/plan.md`
> Research: `context/changes/shadcn-design-refresh/research.md`

## What & Why

shadcn/ui is installed and correctly configured but only shallowly adopted (6/67 primitives, 3 unused) — every real screen is hand-rolled Tailwind. Dark mode has a complete color-token layer with zero toggle mechanism. This plan brings `/login`, `/office`, and `/lesson/[token]` onto the design system and wires up a working, system-following dark mode toggle everywhere.

## Starting Point

`components.json` (style `base-nova`, Base UI-based) and `globals.css`'s full `:root`/`.dark` token set were scaffolded early but never built on. `InstructorSidebar.tsx` and `select.tsx` are the two places the pattern already works correctly — everywhere else is raw `<div>`+Tailwind, including two files (`LessonBlock.tsx`, `LessonPopover.tsx`) with divergent status-color values for the same statuses, and a "Cancel lesson" action with no confirmation step.

## Desired End State

All three screens use shadcn primitives/blocks with no hand-rolled duplicates of what's installed. A theme toggle exists on every screen, defaults to OS preference, and persists across navigation. `/` redirects instead of showing `create-next-app` boilerplate. The status-color bug is fixed at the source, and cancelling a lesson requires confirmation.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Form validation library | Keep manual FormData validation; presentational primitives only | react-hook-form+zod is a real architecture decision that shouldn't block design-system work — split off as roadmap `TD-04` | Plan (user, questioning) |
| Cancel/reject confirmation | Keep `LessonResponseForm`'s tested inline flow; add `AlertDialog` only to the previously-unconfirmed "Cancel lesson" | Don't risk regressing a deliberately-tested UX pattern; do fix a real safety gap | Plan (user, questioning) |
| Sidebar structure | Adopt the full shadcn `sidebar` block (collapsible, mobile sheet) | Chosen over incremental restyling for the closer match to what ui.shadcn.com/blocks offers | Plan (user, questioning) |
| Login screen | Adopt `login-03` block wholesale | Closest structural match to the current centered-card layout; no image asset needed | Plan (user, questioning) |
| CalendarGrid | Visual token alignment in scope; grid logic untouched | Otherwise the most-used screen stays the only one broken in dark mode | Plan (user, questioning) |
| Dark mode toggle scope | Everywhere (`/login`, `/office`, `/lesson/[token]`) | The instructor link is opened by external users, often on a phone, in the evening | Plan (user, questioning) |
| Dark mode default | Follow OS/browser preference (`next-themes` `defaultTheme="system"`) | Standard, expected behavior; token layer was built with both modes in mind from the start | Plan (user, questioning) |
| Icon adoption scope | Replace glyphs in every file already touched by another phase | Consistency without a dedicated, low-value icon-only phase | Plan (user, questioning) |
| `Popover` primitive | Delete rather than force a use case | No anchored-popover need exists in the app; the one file named "Popover" is actually a fixed side panel | Plan (deeper file read, deviates from research's suggestion) |

## Scope

**In scope:** all three screens' visual layer, dark mode infrastructure + toggle, `/` redirect, status-color bug fix, Cancel-lesson confirmation, shared `DetailRow`/date-formatter/`OverrideEmailField` extraction, e2e test updates for interaction-model changes.

**Out of scope:** react-hook-form/zod adoption (→ `TD-04`), displaying the rejection reason in office UI (already-tracked separate gap), `table`/`skeleton`/`tooltip`/`navigation-menu` primitives, `CalendarGrid`'s grid-layout logic, `LessonResponseForm`'s flow structure.

## Architecture / Approach

A foundation phase (dark mode provider/toggle, home redirect, primitive installs) precedes four screen-by-screen phases (login, office shell, calendar, lesson panel) and a final instructor-page phase that consumes the shared components built during the lesson-panel phase. Every phase that changes a component's accessible role or interaction model updates the corresponding e2e assertion in the same phase, following the click-trigger-then-pick-option pattern already established in `e2e/office-books-lesson.spec.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundations | Dark mode provider/toggle, `/` redirect via `proxy.ts`, primitive installs, `Popover` removal | Hydration mismatch if `suppressHydrationWarning` is missed |
| 2. Login | `login-03` block wired to existing `loginAction` | Block's generated form must use `action`, not `onSubmit` (React 19 rule) |
| 3. Office shell | Full shadcn `sidebar` block replacing `InstructorSidebar`/`office/layout.tsx` | `SidebarMenuButton` must still render as a plain `<button>` named after the instructor, or the existing e2e test breaks |
| 4. Calendar tokens | `CalendarGrid`/`WeeklyCalendar`/`LessonBlock` on tokens; canonical status-color module | No semantic warning/success token exists — must stay on Tailwind palette with explicit `dark:` variants |
| 5. Lesson panel | `Drawer` conversion, shared components, `AlertDialog` for Cancel, `Select` conversion | Drawer's accessible name/role must match the prior manual `aria-label` or the e2e dialog assertion breaks |
| 6. Lesson-response page | Shared components + tokens + toggle on the public instructor page | None significant — smallest, most isolated phase |

**Prerequisites:** none beyond what's already merged to `main` (research + roadmap sync from PRs #63/#64).
**Estimated effort:** ~6 phases, each independently shippable and testable; roughly a session or two per phase given the file counts involved.

## Open Risks & Assumptions

- `e2e/seed.spec.ts`'s heading assertion (`/office/i`) appears to be a pre-existing gap with no matching element in the current DOM — Phase 3 closes it as a side effect of the sidebar rebuild, but this was not independently confirmed as previously passing.
- Vaul's `Drawer` default `role`/`aria-modal` output on the accessible name needs verifying against the prior manual markup during Phase 5 implementation, not assumed.
- `npx shadcn add sidebar`/`login-03` are assumed to resolve correctly against the `base-nova` style with the project's empty `registries: {}` — not dry-run tested during planning.

## Success Criteria (Summary)

- All three screens visually match shadcn/ui primitives/blocks with a working dark mode toggle that defaults to OS preference.
- Existing e2e suite (`seed.spec.ts`, `office-books-lesson.spec.ts`) passes, with only the two documented, expected line changes.
- The status-color bug and the missing Cancel-lesson confirmation are fixed.
