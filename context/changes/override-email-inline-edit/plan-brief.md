# Override Email Inline Edit — Plan Brief

> Full plan: `context/changes/override-email-inline-edit/plan.md`

## What & Why

Replace `OverrideEmailField`'s checkbox-reveals-a-separate-blank-input UX with a single
field-like box showing the current recipient email next to a pencil icon — clicking it
edits that same box in place, pre-filled with the current email. Flagged by the user
(roadmap TD-10, GitHub #74) as a two-step flow that's more awkward than it needs to be.

## Starting Point

`OverrideEmailField` is used identically by two panels but wired in two different ways:
`NewLessonForm` reads the override value from raw `FormData` at submit time (uncontrolled
input), while `LessonPopover` uses fully controlled React state read immediately on
submit. Neither has any test coverage today.

## Desired End State

One component, one interaction pattern, in both panels: a bordered input-styled box with a
pencil icon, always. Click (or click the pencil) to edit in place; Enter/blur commits;
Escape reverts and exits; an invalid email blocks commit with an inline error. Only edits
that actually change the email count as an override — retyping the original, or leaving it
untouched, sends nothing extra.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Commit mechanism | Blur or Enter commits, Escape cancels | Matches common click-to-edit patterns (Notion/Linear) with zero extra UI | Plan |
| Override-active detection | Internal "dirty" flag — override only if committed value differs from original | Preserves old checkbox semantics 1:1 without reintroducing a second toggle | Plan |
| No-email-on-file case | Same pencil-to-edit pattern; display shows "No email on file" | One consistent interaction regardless of whether an email exists, no special-casing | Plan |
| Client validation | Manual `checkValidity()` check before commit, blocking with inline error | `LessonPopover`'s Resend button isn't inside a `<form>`, so native validation-on-submit doesn't cover it | Plan |
| Data-flow unification | Both consumers lift `overrideEmail: string \| undefined` via one callback; `NewLessonForm` mirrors it into a hidden input | Reuses the exact hidden-input-from-state pattern this file already uses for `category` — no new pattern invented | Plan |
| Test coverage | Component test on `OverrideEmailField` only, no new consumer tests | All interaction logic lives in the shared component; matches the project's cost×signal testing principle | Plan |
| Phasing | Single phase, both consumers together | Prop contract change is small; avoids a window of inconsistent UX between the two panels | Plan |
| Visual style | Always looks like a bordered `Input` box, pencil inside on the right, in both display and edit mode | Matches the ticket's literal ask of "a single field-like box" | Plan |

## Scope

**In scope:** `OverrideEmailField.tsx` rewrite; `NewLessonForm.tsx` and `LessonPopover.tsx`
wiring updates; new `OverrideEmailField.test.tsx`.

**Out of scope:** Any server-action change (`createLesson`/`regenerateLessonToken` already
accept `overrideEmail?: string`); persisting the override anywhere; `instructors.email`
editability; new tests for the two consumer components.

## Architecture / Approach

`OverrideEmailField` becomes self-contained (owns edit/draft/validation state) and reports
committed changes via one `onOverrideChange(value: string | undefined)` callback. Both
consumers replace their old `useOverrideEmail` boolean with a single lifted
`overrideEmail` state variable; `NewLessonForm` additionally mirrors that state into a
hidden `<input name="overrideEmail">` so its existing `FormData`-based submit handler needs
no structural change.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Rewrite + wire both consumers + test | New pencil-edit component live in both lesson panels, with component test coverage | Escape-then-blur ordering (draft must reset before blur fires) is subtle — documented in the plan's Critical Implementation Details |

**Prerequisites:** None — self-contained UI change, no dependencies on other in-flight work.
**Estimated effort:** Single session, one phase, ~4 files touched (3 edits + 1 new test file).

## Open Risks & Assumptions

- Assumes lucide-react's `Pencil` icon is available in the installed version (^1.22.0) —
  not explicitly verified, but the package is already a dependency and `Pencil` is a
  standard icon in that library.
- Assumes no other consumers of `OverrideEmailField` exist beyond the two found
  (`NewLessonForm.tsx`, `LessonPopover.tsx`) — confirmed via repo-wide grep during planning.

## Success Criteria (Summary)

- Office staff can book a lesson or resend a link with an overridden email using a single
  click-to-edit box, with no separate checkbox step.
- Not touching the field sends to the instructor's default email; editing it and reverting
  to the original also results in no override being sent.
- Invalid emails are caught before submission with inline feedback, in both panels.
