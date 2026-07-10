<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Instructor Responds (S-02 rework)

- **Plan**: context/changes/instructor-responds/plan.md
- **Scope**: Phase 6 of 8 (AI-suggested rejection reasons, incl. the follow-up observability/timeout fix)
- **Date**: 2026-07-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Plan text still describes Vercel AI Gateway; shipped code uses direct OpenAI

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/instructor-responds/plan.md:542-560
- **Detail**: Phase 6's title ("Vercel AI Gateway") and item 1's contract (`AI_SUGGESTION_MODEL` defaulting to a gateway-style `openai/gpt-4o-mini` string) describe the original gateway-based design. Mid-implementation you explicitly asked to switch to calling OpenAI directly via `@ai-sdk/openai` with a `platform.openai.com` key. The shipped code correctly reflects that pivot (`OPENAI_API_KEY`, bare model id `gpt-5.4-nano`, `@ai-sdk/openai` dependency) — confirmed via `git log -p .env.example`, no gateway-style var ever existed in history. The pivot itself is fine and deliberate; the plan document was simply never updated to match, so it's now a stale source of truth.
- **Fix**: Add a short addendum to Phase 6's Overview/item 1 in plan.md noting the pivot (direct OpenAI provider instead of AI Gateway, why, and the resulting env-var/dependency changes).
- **Decision**: FIXED — addendum added to plan.md's Phase 6 Overview

### F2 — `generateObject` is deprecated in the installed `ai` package

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ai/suggestRejectionReasons.ts:16-24
- **Detail**: Confirmed via `node_modules/ai/dist/index.d.ts:7253` — `generateObject` carries `@deprecated Use generateText with an output setting instead.` It still works today (verified `@ai-sdk/openai@4.0.11` and `ai@7.0.20` share a compatible `@ai-sdk/provider`/`provider-utils` chain, no runtime break), so this isn't urgent, but it's real debt on a file we just wrote fresh.
- **Fix A ⭐ Recommended**: Migrate now to `generateText({ output: Output.object({ schema }) })` while the file is small and freshly covered by tests.
  - Strength: Removes the deprecation before a future `ai` major bump silently breaks it; cheapest time to migrate is right after writing the tests that pin behavior.
  - Tradeoff: The `vi.mock('ai', ...)` test doubles need updating too (`generateText`'s return shape differs — `result.output` vs `object`), so this isn't purely mechanical.
  - Confidence: HIGH — the migration path is documented (AI SDK skill's common-errors reference) and mechanical.
  - Blind spot: Haven't verified there's no subtle behavior difference in `@ai-sdk/openai`'s structured-output mode between `generateObject` and `generateText`+`Output.object` (e.g. repair/retry semantics on malformed JSON).
- **Fix B**: Defer — leave as `generateObject`, track as a follow-up.
  - Strength: Zero risk right now; still fully functional.
  - Tradeoff: Debt accumulates silently until a future `ai` upgrade removes it without warning.
  - Confidence: MEDIUM — deprecated AI SDK APIs are typically kept for several majors, but there's no guarantee.
  - Blind spot: No known removal timeline.
- **Decision**: FIXED — migrated to `generateText` + `Output.object`; test mocks updated; verified against the real OpenAI API post-migration (5 well-formed reasons, same shape)

### F3 — `suggestRejectionReasonsAction` has no input validation and no rate limiting on an unauthenticated endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/actions/lessons/suggestRejectionReasonsAction.ts:4-9
- **Detail**: The action forwards `{ scheduledAt, category }` straight to `suggestRejectionReasons` with no shape/length validation. It's a public Next.js server action — callable directly (not only through the UI) by anyone with no session, since `/lesson/[token]` has no auth concept by design. That means: (1) arbitrary-length strings can be interpolated into the OpenAI prompt with zero cap, i.e. unbounded per-call token cost with no rate limiting — a cost-based abuse vector; (2) a mild prompt-injection surface, since `category`/`scheduledAt` are only "safe" because the real UI happens to pass real values — the action itself enforces nothing.
- **Fix A ⭐ Recommended**: Add minimal server-side validation in `suggestRejectionReasonsAction` — parse `scheduledAt` as a real ISO date and check `category` against the app's known category set/length before calling the AI at all; return `[]` early otherwise.
  - Strength: Closes the immediate unbounded-input/cost vector with a small, local, no-new-infra change.
  - Tradeoff: Doesn't fully stop repeated valid-shaped abuse — that needs rate limiting, a separate concern.
  - Confidence: HIGH — straightforward, low-risk validation.
  - Blind spot: Haven't checked whether Vercel-level protection (e.g. Firewall/BotID) already mitigates repeated-call abuse in front of this action.
- **Fix B**: Add real rate limiting (per-IP or per-token) in front of this action.
  - Strength: Addresses the actual repeated-call abuse vector, not just malformed input.
  - Tradeoff: New infra/dependency and design work — likely oversized for a low-traffic driving-school app right now.
  - Confidence: MEDIUM — correct long-term fix, possibly premature.
  - Blind spot: No existing rate-limiting pattern anywhere else in this codebase to mirror.
- **Decision**: FIXED — added scheduledAt (valid-date) and category (non-empty, ≤20 chars) validation in suggestRejectionReasonsAction, test-first; returns `[]` early without calling the AI on invalid input. Rate limiting (Fix B) not addressed — noted as a separate follow-up if abuse is observed.

### F4 — Suggestion failures are only visible via console.error, no Sentry hook

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/ai/suggestRejectionReasons.ts:26-30
- **Detail**: The catch block logs via `console.error` (added specifically so Vercel Function Logs would show the real error — this was the deliberate outcome of tonight's debugging session). `@sentry/nextjs` is already a project dependency but isn't wired into this catch block, so a recurring failure (bad key, retired model id) has no alerting path beyond someone manually checking logs.
- **Fix**: Add `Sentry.captureException(err)` alongside the existing `console.error` call.
- **Decision**: FIXED — added `Sentry.captureException(err)`, test-first, matching the project's existing `global-error.tsx` pattern

### F5 — No guard against out-of-order suggestion responses on rapid reject-step open/close

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/lesson/[token]/components/LessonResponseForm.tsx:23-32
- **Detail**: `openRejectStep()` fires `suggestRejectionReasonsAction(...).then(setSuggestions)` with no request-id guard or `AbortController`. If the instructor opens/closes the reject step quickly, an older, slower response could resolve after a newer one and silently replace freshly-shown suggestions with stale ones. Low real-world impact (single-user page, `scheduledAt`/`category` are static for the page's lifetime) but a real race in principle.
- **Fix**: Guard the `.then(setSuggestions)` with a request-id ref (`if (id !== latestRequestId.current) return`).
- **Decision**: FIXED — added a `suggestionRequestId` ref guard; stale responses are dropped. No component-test harness exists in this stack to assert this directly, so verified via typecheck/lint + code inspection only.

### F6 — `suggestRejectionReasonsAction` breaks two barrel-wide naming/shape conventions

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/actions/lessons/index.ts:5
- **Detail**: It's the only barrel export with an `Action` suffix (siblings: `createLesson`, `cancelLesson`, `respondToLesson`, `regenerateLessonToken`), and the only one returning a bare `string[]` instead of the `{ error?: string }` shape the others use. Arguably intentional — there's no error state to report here — but worth a deliberate call rather than an implicit one.
- **Fix**: Optional. Either leave as-is (justified: no error path exists) or rename to `suggestRejectionReasons` for barrel-naming parity. No forced change.
- **Decision**: ACCEPTED — naming/shape difference is deliberate (no error state to report; avoids name collision with the lib function). No code change.

### F7 — "Submit path unaffected" success criterion isn't independently asserted, only structurally guaranteed

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/app/lesson/[token]/components/LessonResponseForm.tsx:34-44
- **Detail**: The plan's Phase 6 success criteria claim "the reject flow's submit path is exercised and succeeds identically whether suggestions resolved or not." `lessons.test.ts`'s `suggestRejectionReasonsAction` describe block tests the action in isolation but doesn't exercise the reject-submit path together with it — that guarantee currently comes from `LessonResponseForm.tsx`'s wiring (submit only ever calls `respondToLesson`, never awaits the suggestion promise), not from an explicit automated assertion. The claim holds by code structure, not by a directly-testing assertion.
- **Fix**: Optional — no component-test harness exists in this stack (no `@testing-library/react`/jsdom setup) to assert this directly without new infra; low priority since the wiring is simple and reviewable by inspection.
- **Decision**: SKIPPED — no component-test harness in this stack; disproportionate to add one for a single wiring guarantee. Left as a documented, inspectable code guarantee.
