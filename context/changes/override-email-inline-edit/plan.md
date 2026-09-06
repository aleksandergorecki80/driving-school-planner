# Override Email Inline Edit Implementation Plan

## Overview

Replace `OverrideEmailField`'s two-step "checkbox + separate blank input" UX with a
single field-like box that shows the current recipient email next to a pencil icon;
clicking the icon turns that same box editable in place, pre-filled with the current
email. Used identically by the new-lesson booking panel (`NewLessonForm`) and the
resend-link flow (`LessonPopover`).

## Current State Analysis

`OverrideEmailField` (`src/components/lesson/OverrideEmailField.tsx`) renders static
text ("Link will be sent to `<email>`"), a `Checkbox` ("Send to a different email..."),
and — only when checked — a second, blank `Input` below it. The two consumers wire it
very differently:

- `NewLessonForm.tsx` treats the override input as **uncontrolled**: it passes
  `inputName="overrideEmail"` and reads the typed value via `formData.get('overrideEmail')`
  inside its `action={handleAction}` handler, gated by a separate `useOverrideEmail`
  boolean tracked only to decide whether to honor that value.
- `LessonPopover.tsx` treats it as **controlled**: `inputValue`/`onInputChange` wired to
  local state, read directly (`overrideEmail.trim()`) inside `handleResend`, gated by its
  own `useOverrideEmail` boolean.

Both consumers already pass an `overrideEmail: string | undefined` through to a server
action that accepts it as an optional param (`createLesson`, `regenerateLessonToken`) — no
backend changes are needed.

No test currently covers `OverrideEmailField`, `NewLessonForm`, or `LessonPopover`.

### Key Discoveries:

- `NewLessonForm.tsx` already has an established pattern for feeding a piece of React
  state into its `FormData`-based `action` handler: `selectedCategory` state is mirrored
  into `<input type="hidden" name="category" value={selectedCategory} />`, and
  `handleAction` reads it via `formData.get('category')` (`src/app/office/components/lesson-panel/NewLessonForm.tsx:117`).
  The new override-email wiring reuses this exact pattern instead of inventing a new one —
  it eliminates the controlled/uncontrolled split between the two consumers entirely: both
  now lift `overrideEmail: string | undefined` state from the same component callback, and
  only `NewLessonForm` additionally mirrors it into a hidden input for `FormData` to see.
- The shadcn `Input` (`src/components/ui/input.tsx`) is a thin wrapper spreading `...props`
  onto `@base-ui/react/input`, so `readOnly`, `aria-label`, `ref`, and `onKeyDown` all pass
  through without modification.
- `input[type="email"]` exposes `.checkValidity()` / `validity.valid` even outside a
  `<form>`, so `LessonPopover` (whose Resend button is not inside a `<form>`) can still get
  real format validation without a form-level submit.
- Icon-only buttons in this codebase already carry an `aria-label` (see the close button in
  `NewLessonForm.tsx`, `aria-label="Close panel"`, using the `icon-sm` `Button` size
  variant) — the pencil button follows the same convention.
- Component-level interaction tests already exist in this codebase
  (`LessonBlock.test.tsx`, `CalendarGrid.test.tsx`), scoped to jsdom per-file via a
  `// @vitest-environment jsdom` pragma at the top of the file (the project's default
  Vitest environment is `node`, per `vitest.config.ts`).

## Desired End State

`OverrideEmailField` shows the current recipient email inside a bordered, input-styled box
with a pencil icon on the right — in both display and edit mode, so it always reads as "a
field you could click into." Clicking the pencil (or the box) makes that same box editable,
pre-filled with the current email. Enter or blur commits; Escape reverts to the
previously-committed value and exits edit mode. An invalid email blocks commit and shows an
inline error. The field reports a real override only when the committed value differs from
the original `targetEmail` — an edit that ends up matching the original, or an empty
commit, both count as "no override." Both `NewLessonForm` and `LessonPopover` consume it
identically via a single `onOverrideChange(value: string | undefined)` callback.

Verify by: booking a lesson with an overridden email (server receives the override),
booking without touching the field (server receives no override), resending a lesson link
with and without an override, and confirming Escape/blur/invalid-email behave as specified
in both panels.

## What We're NOT Doing

- No changes to `createLesson`, `regenerateLessonToken`, or any server-side code — both
  already accept `overrideEmail?: string` and this change only affects how that value is
  collected in the UI.
- No persistence of the override email anywhere (matches existing behavior — one-shot,
  non-persisted, per DOC-01 / FR-013).
- No new tests for `NewLessonForm` or `LessonPopover` themselves — the interaction logic
  under test lives entirely inside `OverrideEmailField`; the two consumers' wiring is thin
  enough to verify manually.
- No changes to `instructors.email` editability or any other field on the lesson panels.

## Implementation Approach

Rewrite `OverrideEmailField` as a self-contained display/edit control that owns its own
`isEditing`, `draftValue`, and validation-error state, and reports committed changes
upward through a single callback. Both consumers replace their `useOverrideEmail` boolean +
raw string state with a single `overrideEmail: string | undefined` state variable fed by
that callback — `NewLessonForm` additionally mirrors it into a hidden input using the
codebase's existing hidden-input-from-state pattern (see Key Discoveries) so its
`FormData`-based submit keeps working unchanged.

## Critical Implementation Details

**State sequencing (Escape vs. blur):** Escape must reset `draftValue` back to the
last-committed value and exit edit mode *before* triggering blur (e.g. call
`inputRef.current?.blur()` as the last step of the Escape handler, after state is already
reset). This makes the blur-triggered commit a no-op — it recomputes against the
now-identical draft/committed values — so a single commit function serves both the
Escape-then-blur path and a plain blur, with no need for a "was this Escape" flag.

**Invalid email on blur:** When `draftValue` fails `checkValidity()` at commit time, do
not exit edit mode and do not call `onOverrideChange` — keep `isEditing: true`, show the
inline error, and leave the input showing the invalid text so the user can fix it in
place. This means blur alone cannot force an exit while the value is invalid; the user
either fixes it or presses Escape to revert and exit.

## Phase 1: Rewrite OverrideEmailField and wire both consumers

### Overview

Ship the new component and both call sites together — the prop contract change is small
and both consumers are 1-line usages of it, so there's no value in splitting this into
separate reviewable increments; a two-phase split would leave the two lesson panels with
inconsistent UX in between.

### Changes Required:

#### 1. Rewrite the shared field component

**File**: `src/components/lesson/OverrideEmailField.tsx`

**Intent**: Replace the checkbox-reveals-input UI with a single bordered box (styled like
the shadcn `Input`) showing either the current email (read-only) or an editable draft,
with a pencil icon button on the right that toggles edit mode. Handle commit (Enter/blur),
cancel (Escape), and inline validation, and report only genuine overrides upward.

**Contract**:
- Props become: `targetEmail: string | null`, `disabled?: boolean`, `editAriaLabel: string`
  (replaces `checkboxLabel`; used as the pencil button's `aria-label`, e.g. "Edit recipient
  email for this lesson only" / "...for this resend only"), `onOverrideChange: (value:
  string | undefined) => void`. Drop `checked`, `onCheckedChange`, `inputName`,
  `inputValue`, `onInputChange` — no longer part of the contract.
- Internal state: `isEditing: boolean`, `draftValue: string`, `validationError: string | null`.
- Commit function: trims `draftValue`; if it fails `input.checkValidity()`, sets
  `validationError` and stays in edit mode; otherwise calls `onOverrideChange(trimmed &&
  trimmed !== (targetEmail ?? '').trim() ? trimmed : undefined)`, clears
  `validationError`, and exits edit mode.
- Escape handler: resets `draftValue` to the last-committed value, clears
  `validationError`, exits edit mode, then blurs the input (see Critical Implementation
  Details).
- Entering edit mode (pencil click or clicking the box) seeds `draftValue` from the
  current committed value (or `''` when there is none) and focuses the input.
- Uses lucide-react's `Pencil` icon inside an `icon-sm` `Button` (`variant="ghost"`),
  matching the existing close-button convention in `NewLessonForm.tsx`.

#### 2. Wire the new-lesson booking panel

**File**: `src/app/office/components/lesson-panel/NewLessonForm.tsx`

**Intent**: Replace the `useOverrideEmail` boolean with a single lifted
`overrideEmail: string | undefined` state, mirrored into a hidden input so the existing
`FormData`-based `handleAction` keeps working unchanged in spirit.

**Contract**: Remove `useOverrideEmail` state. Add `const [overrideEmail, setOverrideEmail]
= useState<string | undefined>(undefined)`. Render `<input type="hidden"
name="overrideEmail" value={overrideEmail ?? ''} />` alongside the existing hidden
`category` input. Update the `OverrideEmailField` usage to the new props
(`targetEmail`, `disabled`, `editAriaLabel="Send to a different email for this lesson
only"`, `onOverrideChange={setOverrideEmail}`) and drop `inputName`. In `handleAction`,
simplify the derivation: `overrideEmail = typeof overrideEmailValue === 'string' &&
overrideEmailValue.trim() ? overrideEmailValue.trim() : undefined` (unchanged logic, just
no longer gated by a separate boolean since the hidden input is only ever populated when
`OverrideEmailField` reports a real override).

#### 3. Wire the resend-link flow

**File**: `src/app/office/components/lesson-panel/LessonPopover.tsx`

**Intent**: Replace the `useOverrideEmail` + `overrideEmail` pair with a single lifted
`overrideEmail: string | undefined` state.

**Contract**: Remove `useOverrideEmail` state; change `overrideEmail` state's type to
`string | undefined` (initial `undefined`). Update the `OverrideEmailField` usage to the
new props (`targetEmail`, `disabled`, `editAriaLabel="Send to a different email for this
resend only"`, `onOverrideChange={setOverrideEmail}`) and drop `inputValue`/`onInputChange`.
Simplify `handleResend` to call `regenerateLessonToken(lesson.id, overrideEmail)` directly
— drop the `trimmedOverride` derivation, since the component now only ever reports an
already-trimmed override or `undefined`.

#### 4. Component test

**File**: `src/components/lesson/OverrideEmailField.test.tsx`

**Intent**: Cover the interaction states now living entirely inside this component, using
the existing `// @vitest-environment jsdom` + `@testing-library/react` pattern from
`LessonBlock.test.tsx`.

**Contract**: Cases to cover — clicking the pencil enters edit mode pre-filled with
`targetEmail`; typing a new value and blurring commits and calls `onOverrideChange` with
the trimmed value; typing the original value back and committing calls
`onOverrideChange(undefined)`; pressing Escape reverts the draft and exits edit mode
without calling `onOverrideChange`; typing an invalid email and attempting to commit shows
an inline error, stays in edit mode, and does not call `onOverrideChange`; with
`targetEmail={null}`, display mode shows "No email on file" and the pencil still opens an
empty editable field.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type checking passes: `npm run build` (runs type-check + lint) or `tsc --noEmit`
- New component test passes: `npx vitest run src/components/lesson/OverrideEmailField.test.tsx`
- Full test suite still passes: `npm run test`

#### Manual Verification:

- New-lesson panel: booking without touching the email field sends to the instructor's
  default email (no override); editing it and booking sends to the overridden address.
- New-lesson panel: editing the field, then editing it back to the original email before
  submitting, results in no override being sent.
- Resend flow: resending without touching the field uses the default email; editing it and
  resending uses the override.
- Escape while editing reverts the box to its previous value in both panels.
- Typing an invalid email (e.g. `not-an-email`) and blurring shows an inline error and
  keeps the field editable, in both panels.
- Instructor with no email on file: field shows "No email on file", pencil opens an empty
  editable box, typing an address and committing works.
- Pencil button is reachable and operable via keyboard (Tab to focus, Enter/Space to
  activate) and its `aria-label` is announced correctly.

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human that the manual testing was
successful before proceeding to close out the change.

---

## Testing Strategy

### Unit Tests:

- `OverrideEmailField.test.tsx` covers all interaction states listed in Phase 1, Change 4.

### Integration Tests:

- None added — see "What We're NOT Doing." The two consumers' wiring is thin enough that
  automated coverage there would mostly re-test the same commit/cancel logic already
  covered at the component level.

### Manual Testing Steps:

See Phase 1 Manual Verification above — exercised once in each of the two panels
(`NewLessonForm`, `LessonPopover`).

## Performance Considerations

None — this is a small, purely client-side interactive control with no new network calls
or heavy computation.

## Migration Notes

Not applicable — no persisted data or schema involved.

## References

- Roadmap: `context/foundation/roadmap.md` TD-10
- GitHub issue: #74 (`[TD-10] Make the lesson-link recipient email inline-editable via a pencil icon`)
- Existing hidden-input-from-state pattern: `src/app/office/components/lesson-panel/NewLessonForm.tsx:117` (`category`)
- Existing component test pattern: `src/app/office/components/calendar/LessonBlock.test.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rewrite OverrideEmailField and wire both consumers

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 05f4785
- [x] 1.2 Type checking passes: `npm run build` / `tsc --noEmit` — 05f4785
- [x] 1.3 New component test passes: `npx vitest run src/components/lesson/OverrideEmailField.test.tsx` — 05f4785
- [x] 1.4 Full test suite still passes: `npm run test` — 05f4785

#### Manual

- [x] 1.5 New-lesson panel: no-edit → default email sent; edit → override sent — 05f4785
- [x] 1.6 New-lesson panel: edit then revert to original → no override sent — 05f4785
- [x] 1.7 Resend flow: no-edit → default email; edit → override — 05f4785
- [x] 1.8 Escape reverts the box in both panels — 05f4785
- [x] 1.9 Invalid email blocks commit with inline error, in both panels — 05f4785
- [x] 1.10 No-email-on-file instructor: "No email on file" shown, pencil opens empty editable box — 05f4785
- [x] 1.11 Pencil button is keyboard-operable with a correct aria-label — 05f4785
