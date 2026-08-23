---
date: 2026-08-23T19:17:10+02:00
researcher: Claude (10x-research)
git_commit: 6d8c7d299add53b60e4fb6fdec4eeb4753e7179d
branch: feat/code-review-evals
repository: aleksandergorecki80/driving-school-planner
topic: "Eval readiness of tools/code-review — reusing the review prompt/schema in promptfoo"
tags: [research, codebase, code-review, ai-sdk, promptfoo, evals]
status: complete
last_updated: 2026-08-23
last_updated_by: Claude (10x-research)
---

# Research: Eval readiness of tools/code-review — reusing the review prompt/schema in promptfoo

**Date**: 2026-08-23T19:17:10+02:00
**Researcher**: Claude (10x-research)
**Git Commit**: 6d8c7d299add53b60e4fb6fdec4eeb4753e7179d
**Branch**: feat/code-review-evals
**Repository**: aleksandergorecki80/driving-school-planner

## Research Question

Analyze `tools/code-review` for eval readiness — can the review prompt/schema be reused/imported into promptfoo? Use promptfoo if it fits the stack.

## Summary

**Yes — promptfoo is a strong, low-friction fit.** `tools/code-review/review-schema.ts` exports a plain `REVIEW_SYSTEM_PROMPT` string and a Zod `ReviewSchema`, both importable as-is. promptfoo supports a custom `file://` provider written directly in TypeScript — no compile step, no `tsx`/`ts-node` wrapper needed, since promptfoo has its own Node TS loader. That provider can call the exact same `generateText({ model: openai(modelId), system: REVIEW_SYSTEM_PROMPT, output: Output.object({ schema: ReviewSchema }), prompt })` sequence `review.ts` already uses, so the prompt and schema under test are the real production ones, not a re-implementation.

Nothing eval-related exists in the repo today (confirmed: zero hits for "promptfoo", "rubric", "is-json", "llm-rubric"; `promptfoo` is not a dependency). This is a greenfield addition alongside the existing CLI tool and the `ci-cd-code-review` GitHub Actions gate (`.github/workflows/ai-review.yml`), not a replacement for either.

Model comparison, JSON validation, an LLM-graded rubric, and a hand-written pass/fail assertion are all native promptfoo features requiring no plugins:
- `providers:` list with 2-3 model strings (or the custom provider + built-in `openai:` entries mixed) drives the multi-model comparison.
- `is-json` + a custom `javascript` assertion (importing `ReviewSchema.safeParse` directly, rather than duplicating it as JSON Schema) validates structure.
- `llm-rubric` grades semantic correctness (e.g. "did the review correctly flag the SQL injection").
- A `javascript` assertion checks the business rule the task calls for: a bad diff must score low / verdict `fail`.
- `promptfoo eval` exits non-zero (100) on any failing assertion or a pass-rate below threshold — CI-gateable exactly like `review.ts`'s own exit-code convention.

The main design decisions left for `/10x-plan` are: where the eval config/fixtures/custom-provider file live under `tools/code-review/`, which env var carries the model list (mirroring the existing `AI_SUGGESTION_MODEL` convention), and whether/how `npm run eval` wires into CI now or is deferred to a follow-up.

## Detailed Findings

### The reviewable unit (`tools/code-review/`)

- [`tools/code-review/review-schema.ts:1-34`](tools/code-review/review-schema.ts) — `REVIEW_SYSTEM_PROMPT` (lines 3-19, plain template literal) and `ReviewSchema` (lines 21-31, `z.object` with `scores.{correctness,idiomaticity,complexity,testCoverage,security}` each `z.number().min(1).max(10)`, `verdict: z.enum(['pass','fail'])`, `summary: z.string()`). Both are named ESM exports — directly importable by any other module executed in a Node-compatible loader, including a promptfoo custom provider.
- [`tools/code-review/review.ts:1-36`](tools/code-review/review.ts) — the CLI: reads a diff from stdin, resolves `modelId = process.env.AI_SUGGESTION_MODEL ?? 'gpt-5.4-nano'` (line 20), calls `generateText({ model: openai(modelId), system: REVIEW_SYSTEM_PROMPT, output: Output.object({ schema: ReviewSchema }), prompt: \`Review this git diff:\n\n${diff}\`, abortSignal: AbortSignal.timeout(60_000) })` (lines 22-28), prints `JSON.stringify(output, null, 2)` (line 30). This exact call sequence is what an eval provider should replicate, not reinvent.
- No test coverage exists for `tools/` today — `vitest.config.ts`'s `include` is scoped to `src/**/*.test.ts`, so `tools/code-review/` is invisible to `npm test`. An eval config here is genuinely new coverage, not a duplicate of existing tests.

### Codebase-wide AI SDK convention (only two call sites total)

- `src/lib/ai/suggestRejectionReasons.ts` and `tools/code-review/review.ts` are the *only* two places in the repo that call the Vercel AI SDK. Both follow the same shape: `generateText` + `Output.object({ schema })` (never the deprecated `generateObject` — the codebase deliberately migrated off it, per `context/changes/instructor-responds/reviews/impl-review-phase-6.md:33-50`), model resolved via `process.env.AI_SUGGESTION_MODEL ?? 'gpt-5.4-nano'`, and a co-located Zod schema passed straight into `Output.object`.
- `context/domain/03-anti-corruption-layer.md:56-134` treats `suggestRejectionReasons.ts` as the app's ACL boundary for the `ai`/`@ai-sdk/openai` package; `tools/code-review/` is intentionally a separate, standalone CLI tool with its own schema file — an eval harness for it should stay scoped to `tools/code-review/`, not touch `src/lib/ai/`.

### Module resolution — no CJS/ESM friction for a `.ts` provider

- `tsconfig.json`: `"module": "esnext"`, `"moduleResolution": "bundler"`, `"noEmit": true` — a bundler-oriented ESM config, never compiled to disk by `tsc`; `tools/code-review/*.ts` already runs via `npx tsx --env-file=.env.local tools/code-review/review.ts` (`package.json:12-19`, scripts `review`, `review:ci`, `review:working`, `review:staged`, `review:head`, `review:branch`).
- promptfoo's custom provider loader (`file://path/to/provider.ts`) has its own built-in Node TypeScript loader — it does not need `tsx` invoked separately, and it can `import` `review-schema.ts`'s named exports the same way `review.ts` already does (`review.ts:3`). No build step, no CJS/ESM conflict.

### promptfoo capability match (verified against current docs, promptfoo 0.122.0)

- **Custom provider** — `providers: [{ id: 'file://./tools/code-review/promptfoo-provider.ts', label: '...', config: {...} }]`; the file exports a class implementing `ApiProvider` (`id()`, `async callApi(prompt, context)` returning `{ output }`). `context.vars` carries templated test variables (e.g. `{{diff}}`). ([Custom API provider docs](https://www.promptfoo.dev/docs/providers/custom-api/))
- **Multi-model comparison** — a flat `providers:` list (e.g. `openai:gpt-5.4-nano`, `openai:gpt-5-mini`, plus the custom `file://` provider) runs every test case against each entry in one `promptfoo eval` invocation — the native mechanism for "same prompt, N models." ([Configuration reference](https://www.promptfoo.dev/docs/configuration/parameters/))
- **Assertions**: `is-json` (optionally with a JSON-Schema `value:`), `llm-rubric` (`value:` is a natural-language rubric, graded by a `provider:`, which can differ from the model under test), and `javascript` (receives the raw output string + `context.vars`/`context.test`, returns `boolean` or `{ pass, score, reason }`) are all current, documented assertion types. ([Expected outputs docs](https://www.promptfoo.dev/docs/configuration/expected-outputs/))
- **Schema reuse**: promptfoo's `is-json` only accepts JSON Schema, not a Zod object directly. Two options: (a) generate JSON Schema once via Zod v4's native `z.toJSONSchema(ReviewSchema)` and reference it as a `file://` value, or (b) validate inside a `javascript` assertion that imports `ReviewSchema` and calls `.safeParse(JSON.parse(output))` directly — the latter is exact (catches enum/range violations without duplicating the schema) and reuses the same import mechanism as the provider file, so no schema drift is possible. ([is-json details](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/))
- **Fixtures**: `vars: { diff: file://./fixtures/sql-injection.diff }` is the idiomatic way to keep a multi-line diff out of the YAML; `file://` paths resolve relative to the config file. ([Test cases docs](https://www.promptfoo.dev/docs/configuration/test-cases/))
- **CI gating**: `npx promptfoo eval --config promptfooconfig.yaml` (or a local devDependency + npm script) exits **100** on any failing assertion / below-threshold pass rate, **1** on other errors (`PROMPTFOO_FAILED_TEST_EXIT_CODE` can remap). A plain CLI step in a workflow is simpler and more consistent with this repo's existing style than adopting the third-party `promptfoo/promptfoo-action@v1`. ([CI/CD integration docs](https://www.promptfoo.dev/docs/integrations/ci-cd/))
- **API keys**: the built-in `openai:` provider reads `OPENAI_API_KEY` from the environment automatically — the same env var and secret this repo's `review.ts`/CI workflow already use, zero extra wiring. ([OpenAI provider docs](https://www.promptfoo.dev/docs/providers/openai/))

### CI/CD context already in place

- `.github/workflows/ai-review.yml` (added by the `ci-cd-code-review` change, commit `6d8c7d2`) already runs `tools/code-review/review.ts` as a PR gate via `npm run review:ci`, using `OPENAI_API_KEY` as a repo secret. A promptfoo eval step would be a **separate, additive** CI concern (evaluating the reviewer's own quality/regressions) — it does not replace or need to modify `ai-review.yml`.
- No `.github/workflows` currently runs anything named "eval" — this would be a new job/workflow, not an edit to the existing PR-gate workflow, unless `/10x-plan` decides otherwise.

## Code References

- `tools/code-review/review.ts:1-36` — the exact call sequence (`generateText` + `Output.object`) an eval provider should reuse
- `tools/code-review/review-schema.ts:1-34` — `REVIEW_SYSTEM_PROMPT` and `ReviewSchema`, both directly importable
- `package.json:5-19` — existing script conventions (`review`, `review:ci`, etc.) to mirror for a new `eval`/`eval:promptfoo` script
- `package.json:20-38` — confirms `promptfoo` is not yet a dependency; `zod@^4.4.3` (has native `z.toJSONSchema`), `ai@^7.0.20`, `@ai-sdk/openai@^4.0.11` already present
- `vitest.config.ts` — `include: ['src/**/*.test.ts']` confirms `tools/` has zero existing test coverage and a promptfoo eval would need its own script, not vitest integration
- `.github/workflows/ai-review.yml` — existing PR-gate workflow that already exercises `review.ts`; a new eval step is additive, not a replacement
- `.env.example:26-32` — documents `OPENAI_API_KEY` / `AI_SUGGESTION_MODEL`, the same env-var contract a promptfoo config would reuse
- `context/domain/03-anti-corruption-layer.md:56-134` — scopes the AI SDK ACL boundary; confirms `tools/code-review/` is intentionally standalone
- `context/changes/instructor-responds/reviews/impl-review-phase-6.md:33-50` — documents the deliberate `generateObject` → `generateText`+`Output.object` migration this repo follows

## Architecture Insights

- `tools/code-review/` was designed as a thin, stdin-in/JSON-out CLI expressly to be wrappable without modification — this same property (plain, dependency-light exports; no framework coupling) is what also makes it trivially wrappable by a promptfoo custom provider, with zero changes to `review.ts`/`review-schema.ts` required.
- The repo has exactly one AI-SDK calling convention (`generateText` + `Output.object`, model via `AI_SUGGESTION_MODEL` fallback `'gpt-5.4-nano'`) used consistently in both existing call sites — an eval config should resolve its model list the same way (e.g. an env var listing comma-separated model ids, or hardcoded in `promptfooconfig.yaml` with the existing fallback as one of the entries) rather than inventing a new convention.
- Zod v4's native `z.toJSONSchema()` means the "reuse the schema" question has a clean answer without adding a schema-conversion library — though a direct `.safeParse()` inside a `javascript` assertion is more precise and equally reuses the single source of truth.

## Historical Context (from prior changes)

- `context/changes/ci-cd-code-review/research.md` (prior change, commit `a1b1589`) established that `tools/code-review/review.ts` was intentionally left unmodified when wrapping it for CI — the same "wrap, don't rewrite" precedent applies here: the promptfoo provider should call into the existing exports rather than duplicating or forking the prompt/schema.
- That same research doc flags `tools/code-review/` as never using the `/10x-plan` → `/10x-implement` flow itself (it landed as a direct commit, PR #56) — so there is no prior plan/design rationale to reconcile with, only the code and its CI wrapper.

## Related Research

- `context/changes/ci-cd-code-review/research.md` — the GitHub Actions PR-gate wrapper around the same `tools/code-review/` agent; establishes the env-var and "don't rewrite the agent" precedent this change follows.

## Open Questions

1. **Where do the eval config/fixtures/provider file live?** Likely `tools/code-review/promptfooconfig.yaml` + `tools/code-review/fixtures/*.diff` + `tools/code-review/promptfoo-provider.ts`, kept alongside the tool it evaluates — to confirm in `/10x-plan`.
2. **Model list source**: hardcode 2-3 model ids directly in `promptfooconfig.yaml`, or read from an env var (mirroring `AI_SUGGESTION_MODEL`) so CI can pin cheaper models without editing YAML? Needs a decision in planning.
3. **CI wiring now or later**: the task as scoped (`/10x-plan`) only asks for the `promptfooconfig.yaml` and its assertions — whether a new CI job invokes `promptfoo eval` in this same change or is deferred to a follow-up (mirroring how `ci-cd-code-review` was its own separate change from the original `review.ts` agent) is a scope decision for planning.
4. **Grading model for `llm-rubric`**: the rubric assertion needs its own `provider:` (can be a different, larger model than what's under test) — worth deciding whether to reuse one of the 2-3 models already being compared or a separate fixed grader model for consistency across runs.
