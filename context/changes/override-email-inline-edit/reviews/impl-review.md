<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Override Email Inline Edit

- **Plan**: context/changes/override-email-inline-edit/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-09-06
- **Verdict**: REJECTED (pre-triage) → **APPROVED** (post-triage — see Findings' Decision fields)
- **Findings**: 1 critical (fixed), 2 warnings (1 fixed, 1 accepted + filed as TD-17), 1 observation

## Verdicts

Pre-triage (as originally reviewed) → Post-triage (after fixes applied):

| Dimension | Pre-triage | Post-triage |
|-----------|-----------|-------------|
| Plan Adherence | PASS | PASS |
| Scope Discipline | PASS | PASS |
| Safety & Quality | FAIL (F1 critical) | WARNING (F1 fixed; F3 accepted + tracked as TD-17/#94) |
| Architecture | PASS | PASS |
| Pattern Consistency | WARNING (F2) | PASS (F2 fixed) |
| Success Criteria | PASS | PASS |

## Findings

### F1 — Escape can silently commit the discarded draft (blur/cancel race)

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is a well-known, narrowly-scoped pattern
- **Dimension**: Safety & Quality (Reliability)
- **Location**: `src/components/lesson/OverrideEmailField.tsx:53-58` (`cancel`), interacting with `:36-51` (`commit`) and `:84` (`onBlur={commit}`)
- **Detail**: `cancel()` calls `setDraftValue(...)`, `setValidationError(null)`, `setIsEditing(false)` (React-batched, not yet applied) and then `inputRef.current?.blur()`. When the input genuinely has DOM focus (the real-world case), `.blur()` synchronously dispatches a native blur event, which React delivers to `onBlur={commit}` **nested in the same call stack, before `cancel()`'s queued state updates flush**. `commit()`'s closure therefore reads the **stale, pre-reset `draftValue`** — the value the user was trying to discard — and calls `onOverrideChange(nextOverride)` with it immediately. Net effect: pressing Escape can report the abandoned/unvalidated draft to the parent as the committed override.
  The shipped test (`OverrideEmailField.test.tsx:64-82`) passes only because `startEditing`'s `requestAnimationFrame(() => inputRef.current?.focus())` never actually fires in the test (no frame is flushed), so the input never has real `document.activeElement` focus, making `.blur()` in `cancel()` a no-op — a false negative, not proof the guard works. Verified empirically (reviewer wrote a temporary test that flushed real focus before firing Escape — `onOverrideChange` was called with the discarded value, reproducing the bug).
- **Fix**: Add a ref-based guard (e.g. `isCancellingRef`) set to `true` at the top of `cancel()` before calling `.blur()`, checked at the top of `commit()` to short-circuit the commit when a cancel is in flight, then reset to `false` after `.blur()` returns. Update the Escape test to establish real DOM focus on the input (e.g. call `input.focus()` directly after entering edit mode) before firing Escape, so the fix is genuinely exercised rather than passing by accident.
- **Decision**: FIXED — added `isCancellingRef` guard in `OverrideEmailField.tsx` (set `true` before `.blur()` in `cancel()`, checked at the top of `commit()`, reset `false` after). Strengthened the Escape test with a real `input.focus()` call before firing Escape. Confirmed regression-proof: reverted the fix in isolation and re-ran — the strengthened test failed exactly as predicted (`onOverrideChange` called with `'oops@example.com'`); re-applied — 6/6 pass, full suite (103 tests)/lint/typecheck green.

### F2 — Read-only display uses a raw `<button>` instead of the installed shadcn `Button`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/lesson/OverrideEmailField.tsx:91-98`
- **Detail**: Violates the accepted lessons.md rule "Always use shadcn/ui components when building UI." The adjacent pencil button two elements below (line ~101-111) already demonstrates that `Button`'s `className` is fully overridable via `cn`/tailwind-merge, so there's no structural reason the read-only display needed a raw element — it hand-rolls its own `disabled:cursor-not-allowed disabled:opacity-50` instead of inheriting `buttonVariants`' consistent focus-visible/disabled states.
- **Fix**: Replace the raw `<button>` with `<Button variant="ghost" className="h-6 flex-1 justify-start truncate p-0 text-left ...">`, matching the pattern already used for the pencil `Button` in the same file.
- **Decision**: FIXED — replaced with `<Button variant="ghost" className="h-6 flex-1 justify-start truncate rounded-none border-none p-0 text-left text-sm font-medium text-foreground">`. Lint, typecheck, and component test (6/6) all green.

### F3 — No server-side format/length validation of `overrideEmail` in `createLesson`/`regenerateLessonToken`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural/scope question, not a quick call
- **Dimension**: Safety & Quality (Security, defense-in-depth)
- **Location**: `src/app/actions/lessons/createLesson.ts:74`, `src/app/actions/lessons/regenerateLessonToken.ts:37`
- **Detail**: `OverrideEmailField`'s `checkValidity()` (native `type="email"` format check) is a client-side UX affordance only. Both server actions accept `overrideEmail` as a plain string with only `.trim() || fallback` — no format or length validation — and are directly callable (e.g. via devtools/fetch) bypassing the component entirely. Not exploitable for XSS/injection from what's visible in this review (deep review of `sendLessonLink` is out of scope), but it's a missing validation-at-trust-boundary gap.
- **Fix A ⭐ Recommended**: Leave server-action changes out of this phase (the plan's "What We're NOT Doing" explicitly excluded server-action changes) and record this as a new backlog item for follow-up.
  - Strength: Respects the scope boundary this phase's plan deliberately set; avoids re-opening two files this phase intentionally left untouched.
  - Tradeoff: The gap remains open until a follow-up lands.
  - Confidence: HIGH — consistent with the plan's own scope discipline.
  - Blind spot: Haven't assessed how urgent this hardening actually is (e.g. whether `sendLessonLink` has its own downstream validation that already mitigates this).
- **Fix B**: Add a minimal server-side email format/length guard in both actions now, in this phase.
  - Strength: Closes the gap immediately.
  - Tradeoff: Expands this phase's scope into two files the plan explicitly excluded; no test coverage planned for that path in this phase.
  - Confidence: MEDIUM — straightforward to add but changes phase scope after the fact.
  - Blind spot: Haven't checked whether `sendLessonLink` or another layer already validates.
- **Decision**: ACCEPTED (Fix A) — left out of this phase per the plan's scope boundary. Filed as roadmap TD-17 (`context/foundation/roadmap.md`) and GitHub issue #94 for follow-up.

## Observations

- **`committedValue` internal state undocumented** (`OverrideEmailField.tsx:20`) — the plan's Contract lists only `isEditing`, `draftValue`, `validationError` as internal state; the implementation adds a 4th, `committedValue`, used to display and reseed a committed override across renders (the parent's `targetEmail` prop is static and never reflects the override). Functionally necessary, not a defect — noted for plan-accuracy only, no action needed.
- **Test #2 doesn't exercise real trimming** — asserts commit with a value that has no leading/trailing whitespace, so it proves the "differs from original" path but not literal trim behavior. Low-value gap, not required to fix.
- Non-null-assertion rule, hidden-input-from-state pattern, test file conventions (`@vitest-environment jsdom` pragma, `afterEach(cleanup)`, `fireEvent`, plain assertions), and `rAF` cleanup on unmount (harmless no-op via optional chaining) all reviewed — no issues found beyond what's captured in F1.
