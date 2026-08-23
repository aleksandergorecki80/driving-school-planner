# Code Review Evals Implementation Plan

## Overview

Add a [promptfoo](https://www.promptfoo.dev) eval suite that exercises the existing `tools/code-review/` review agent — comparing model choice (gpt-5.4-nano vs gpt-5-mini) on a fixture diff carrying two known flaws (a Supabase PostgREST filter-injection vulnerability and no accompanying test), asserting valid JSON, schema conformance, the expected low-score/fail business outcome, and a semantic rubric check.

## Current State Analysis

`tools/code-review/review-schema.ts` exports `REVIEW_SYSTEM_PROMPT` (a template-literal string) and `ReviewSchema` (a Zod object: `scores.{correctness,idiomaticity,complexity,testCoverage,security}` 1-10, `verdict: 'pass'|'fail'`, `summary: string`). `tools/code-review/review.ts` is a stdin-in/JSON-out CLI that calls `generateText({ model: openai(modelId), system: REVIEW_SYSTEM_PROMPT, output: Output.object({ schema: ReviewSchema }), prompt: \`Review this git diff:\n\n${diff}\`, abortSignal: AbortSignal.timeout(60_000) })` with `modelId = process.env.AI_SUGGESTION_MODEL ?? 'gpt-5.4-nano'`.

No eval tooling exists anywhere in the repo today — `promptfoo` is not a dependency, and `tools/` is outside vitest's `include` glob (`vitest.config.ts`), so this agent has zero automated test coverage today. `.github/workflows/ai-review.yml` already wraps `review.ts` as a PR gate via `npm run review:ci`, using `OPENAI_API_KEY` as a repo secret — this plan is additive to that, not a replacement.

## Desired End State

Running `npm run eval` locally (or `npm run eval:ci` in a CI context with `OPENAI_API_KEY` already in the environment) executes a promptfoo eval that: calls the real review agent's prompt/schema against two models on one fixture diff, and fails (non-zero exit) if the output isn't valid JSON, doesn't conform to `ReviewSchema`, doesn't correctly score/fail the flawed diff, or an LLM grader judges the review as missing the injected flaws.

### Key Discoveries:

- `tools/code-review/review-schema.ts:1-34` — `REVIEW_SYSTEM_PROMPT` and `ReviewSchema` are plain ESM exports, importable as-is by a promptfoo custom provider.
- `tools/code-review/review.ts:20-28` — the exact `generateText`/`Output.object` call sequence to replicate inside the eval provider.
- promptfoo loads `file://*.ts` custom providers with its own Node TS loader — no `tsx`/compile step needed (verified against current promptfoo docs during research).
- `package.json:12-19` — existing `review`/`review:ci` script pairing (local `--env-file=.env.local` vs CI relying on injected env) is the pattern this plan's `eval`/`eval:ci` scripts mirror.

## What We're NOT Doing

- Not modifying `tools/code-review/review.ts` or `review-schema.ts` — the eval provider imports and reuses them unchanged.
- Not wiring this eval into `.github/workflows/` or any CI job in this change — `npm run eval:ci` exists as a script, ready for a follow-up change to invoke, but no workflow file is added or edited here.
- Not adding a cross-provider (e.g. Anthropic) comparison — both models under test are OpenAI models via the existing `@ai-sdk/openai` integration.
- Not adding a second fixture diff — one combined-flaw diff covers both the security and testCoverage criteria in this pass.

## Implementation Approach

A promptfoo custom provider (`tools/code-review/evals/provider.ts`) wraps the real `generateText`/`Output.object` call from `review.ts`, parameterized by a `model` config value so the same file can represent both models under test as two separate provider entries in `promptfooconfig.yaml`. The fixture diff and two `javascript` assertion scripts live alongside it under `tools/code-review/evals/`. `promptfoo` is added as a pinned devDependency (matching how `tsx`/`vitest` are already installed rather than invoked via a floating `npx ...@latest`).

## Critical Implementation Details

**Env var loading for the `promptfoo` CLI binary.** Unlike `review.ts` (run via `npx tsx --env-file=.env.local ...`), the `promptfoo` binary is not invoked through `tsx`, so `--env-file` can't be passed to it the same way. Node's own `--env-file` flag works on any script, including another package's bin file — so the local script must invoke `node --env-file=.env.local node_modules/.bin/promptfoo eval ...` directly rather than relying on a `tsx`-style wrapper. `eval:ci` skips this since CI injects `OPENAI_API_KEY` directly into the environment already (same pattern as `review:ci`).

**Custom provider constructor/type shape may vary by installed promptfoo version.** The `ApiProvider` interface (`id()`, `callApi(prompt, context)`) and its constructor signature come from the `promptfoo` package's own type definitions — confirm the exact import path and constructor shape against `node_modules/promptfoo`'s shipped types when implementing, rather than assuming the shape below is byte-exact.

## Phase 1: Eval scaffolding, dependency, and custom provider

### Overview

Set up the `tools/code-review/evals/` directory, add `promptfoo` as a devDependency, and implement the custom provider that wraps the real review-agent call.

### Changes Required:

#### 1. Add promptfoo devDependency

**File**: `package.json`

**Intent**: Install `promptfoo` as a pinned devDependency so eval runs are reproducible and don't depend on a floating `npx ...@latest` resolution, consistent with how `tsx`/`vitest` are already managed.

**Contract**: Add `"promptfoo": "^0.122.0"` (or the latest stable version available at implementation time) to `devDependencies`, run `npm install` to update `package-lock.json`.

#### 2. Custom provider wrapping the review agent

**File**: `tools/code-review/evals/provider.ts`

**Intent**: Implement promptfoo's `ApiProvider` interface so each test case's prompt (the raw diff text) is run through the exact same `generateText`/`Output.object` call `review.ts` uses, with the model selectable via the provider's `config.model`, and the structured result returned as a JSON string for downstream assertions to parse.

**Contract**: A default-exported class implementing `ApiProvider` from `'promptfoo'`, importing `REVIEW_SYSTEM_PROMPT` and `ReviewSchema` from `../review-schema`. `id()` returns a label identifying the provider + model (e.g. `` `code-review-agent:${model}` ``). `callApi(prompt)` builds `promptText = \`Review this git diff:\n\n${prompt}\`` (matching `review.ts:26` exactly), calls `generateText({ model: openai(modelId), system: REVIEW_SYSTEM_PROMPT, output: Output.object({ schema: ReviewSchema }), prompt: promptText, abortSignal: AbortSignal.timeout(60_000) })`, and returns `{ output: JSON.stringify(output) }`. `modelId` is read from the provider's own `config.model`, defaulting to `'gpt-5.4-nano'` to match `review.ts`'s own default.

### Success Criteria:

#### Automated Verification:

- `promptfoo` appears in `package.json` devDependencies and `package-lock.json` is updated: `npm ls promptfoo`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- `provider.ts` can be imported without throwing (no missing-module errors) when promptfoo loads it

---

## Phase 2: Fixture diff and assertion scripts

### Overview

Author the single combined-flaw fixture diff and the two `javascript` assertion scripts (schema validity, bad-diff business rule).

### Changes Required:

#### 1. Fixture diff with both known flaws

**File**: `tools/code-review/evals/fixtures/injection-no-tests.diff`

**Intent**: A realistic, PR-sized unified diff that a reviewer should flag on two independent axes: a security flaw and a missing-test gap, so the eval exercises both the `security` and `testCoverage` criteria in `ReviewSchema` at once.

**Contract**: The diff adds a new server action (or route handler) that builds a Supabase PostgREST filter (e.g. `.or()`/`.filter()`) by interpolating unsanitized user input directly into the filter string — a real PostgREST filter-injection pattern for this stack, not a generic raw-SQL snippet that wouldn't match how this codebase actually talks to its database. The diff adds no corresponding `*.test.ts` file for the new code.

#### 2. Schema-validity assertion

**File**: `tools/code-review/evals/assertions/assertValidSchema.js`

**Intent**: Confirm the provider's raw output string is valid JSON that conforms exactly to `ReviewSchema`, reusing the real schema so there's no drift between what's tested and what's enforced in production.

**Contract**: A CommonJS module default-exporting a function `(output, context) => ({ pass, score, reason })`. It `JSON.parse(output)`, then calls `ReviewSchema.safeParse(...)` (imported from `../../review-schema`) — `pass` is `result.success`, `reason` includes `result.error` details on failure.

#### 3. Bad-diff business-rule assertion

**File**: `tools/code-review/evals/assertions/assertBadDiffFails.js`

**Intent**: Enforce the core requirement of this task — the flawed fixture diff must score low / fail, not merely produce well-formed output.

**Contract**: A CommonJS module default-exporting a function `(output, context) => ({ pass, score, reason })`. Parses the JSON output and passes only if `verdict === 'fail'` AND `scores.security <= 3` (the security flaw is the more safety-critical of the two injected issues, so it anchors the numeric check; `testCoverage` is left to the `llm-rubric` assertion to catch qualitatively rather than double-encoding a second numeric threshold here).

### Success Criteria:

#### Automated Verification:

- Both assertion files are valid, loadable CommonJS (no syntax errors): `node -c tools/code-review/evals/assertions/assertValidSchema.js` and same for `assertBadDiffFails.js`
- Linting passes: `npm run lint`

#### Manual Verification:

- Fixture diff reads as a plausible real PR diff (correct unified-diff format, applies conceptually to the codebase's actual patterns)

---

## Phase 3: promptfooconfig.yaml, npm scripts, and verification

### Overview

Wire the provider, fixture, and assertions together into a runnable `promptfooconfig.yaml`, add the npm scripts, and confirm the eval actually fails on the bad fixture and reports results per model.

### Changes Required:

#### 1. Eval configuration

**File**: `tools/code-review/evals/promptfooconfig.yaml`

**Intent**: Define the two model-under-test providers (same custom provider file, different `config.model`), the single fixture-backed test case, and all four assertions, including a fixed `gpt-5-mini` grader for the `llm-rubric` check (independent of which model produced the review, for consistent grading).

**Contract**:
```yaml
providers:
  - id: file://./provider.ts
    label: review-agent-gpt-5.4-nano
    config:
      model: gpt-5.4-nano
  - id: file://./provider.ts
    label: review-agent-gpt-5-mini
    config:
      model: gpt-5-mini

prompts:
  - "{{diff}}"

tests:
  - description: "Injection + missing-test diff should score low and fail"
    vars:
      diff: file://./fixtures/injection-no-tests.diff
    assert:
      - type: is-json
      - type: javascript
        value: file://./assertions/assertValidSchema.js
      - type: javascript
        value: file://./assertions/assertBadDiffFails.js
      - type: llm-rubric
        value: "The review correctly identifies both that the diff introduces a PostgREST filter-injection vulnerability via unsanitized string interpolation, and that no test was added for the new code."
        provider: openai:gpt-5-mini
```

#### 2. npm scripts

**File**: `package.json`

**Intent**: Provide a local-dev entrypoint (env loaded from `.env.local`) and a CI-safe entrypoint (relies on the environment already having `OPENAI_API_KEY`), mirroring the existing `review`/`review:ci` pairing.

**Contract**: Add to `scripts`:
```json
"eval": "node --env-file=.env.local node_modules/.bin/promptfoo eval --config tools/code-review/evals/promptfooconfig.yaml",
"eval:ci": "promptfoo eval --config tools/code-review/evals/promptfooconfig.yaml"
```

### Success Criteria:

#### Automated Verification:

- `npm run eval` runs to completion and exits non-zero (promptfoo's documented failing-assertion exit code) because the fixture diff is intentionally flawed
- Both provider labels (`review-agent-gpt-5.4-nano`, `review-agent-gpt-5-mini`) appear in the eval output/results table
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Inspect the promptfoo results output (or `promptfoo view` if used locally) to confirm: both models' outputs are valid JSON conforming to `ReviewSchema`, both correctly produced `verdict: 'fail'` with a low security score, and the `llm-rubric` assertion passed for both — i.e. the eval is discriminating (it would catch a regression where a model failed to flag the injected issues), not merely passing by construction.

---

## Testing Strategy

### Unit Tests:

- Not applicable — this change's "tests" are the eval's own assertions (`is-json`, schema `javascript` assertion, business-rule `javascript` assertion, `llm-rubric`), which exercise the real review agent end-to-end rather than being unit-tested themselves.

### Integration Tests:

- The promptfoo eval run itself is the integration test: real model calls, real schema, real prompt, against a controlled fixture.

### Manual Testing Steps:

1. Run `npm run eval` locally with `OPENAI_API_KEY` set in `.env.local`.
2. Confirm the run fails (non-zero exit) and the per-assertion breakdown shows the schema/business-rule/rubric checks passing (they correctly detect the flaw) while the overall eval reports the fixture as expected-fail, not an accidental error (e.g. a provider exception, a missing API key, a YAML typo).
3. Temporarily point the fixture at a clean, well-tested diff (not committed) and re-run to sanity-check the assertions don't always fail regardless of input — revert before committing.

## Performance Considerations

Each `npm run eval` invocation makes at minimum 3 real model calls (2 providers under test + 1 rubric grader) per test case. With a single fixture/test case, this is negligible; if more fixtures are added later, cost scales linearly and should be revisited before wiring into a per-PR CI job.

## Migration Notes

Purely additive — no existing files, data, or behavior change. `tools/code-review/review.ts` and `review-schema.ts` are untouched.

## References

- Research: `context/changes/code-review-evals/research.md`
- Wrapped agent: `tools/code-review/review.ts`, `tools/code-review/review-schema.ts`
- Prior CI wrapper precedent (wrap-don't-rewrite): `context/changes/ci-cd-code-review/research.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Eval scaffolding, dependency, and custom provider

#### Automated

- [x] 1.1 `promptfoo` in devDependencies, `package-lock.json` updated
- [x] 1.2 Type checking passes
- [x] 1.3 Linting passes

#### Manual

- [x] 1.4 `provider.ts` imports cleanly

### Phase 2: Fixture diff and assertion scripts

#### Automated

- [ ] 2.1 Both assertion files are valid, loadable CommonJS
- [ ] 2.2 Linting passes

#### Manual

- [ ] 2.3 Fixture diff reads as a plausible real PR diff

### Phase 3: promptfooconfig.yaml, npm scripts, and verification

#### Automated

- [ ] 3.1 `npm run eval` runs to completion, exits non-zero on the flawed fixture
- [ ] 3.2 Both provider labels appear in eval output
- [ ] 3.3 Type checking passes
- [ ] 3.4 Linting passes

#### Manual

- [ ] 3.5 Eval results manually inspected and confirmed discriminating, not passing by construction
