# Code Review Evals — Plan Brief

> Full plan: `context/changes/code-review-evals/plan.md`
> Research: `context/changes/code-review-evals/research.md`

## What & Why

Add a promptfoo eval suite for the existing `tools/code-review/` AI review agent, so model choice and prompt/schema regressions can be tested against a known-bad diff before they reach production, instead of only being caught by eyeballing PR comments.

## Starting Point

`tools/code-review/review.ts` + `review-schema.ts` is a working CLI reviewer (stdin diff → `generateText` + `Output.object(ReviewSchema)` → JSON) already gating PRs via `.github/workflows/ai-review.yml`. It has zero automated test coverage today — `tools/` sits outside vitest's include glob, and no eval tooling exists anywhere in the repo.

## Desired End State

`npm run eval` runs a promptfoo eval that feeds a fixture diff (a PostgREST filter-injection flaw + no test) through the real review prompt/schema on two models, and fails if the output isn't valid JSON, doesn't match `ReviewSchema`, doesn't score the flaw low / verdict `fail`, or an LLM grader judges the review as missing the injected issues.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Fixture design | One combined diff (injection + missing test) | Mirrors a realistic PR and exercises both `security` and `testCoverage` criteria at once | Plan |
| Models compared | gpt-5.4-nano + gpt-5-mini | Tests whether the current production default is good enough vs. a stronger model, at low eval cost | Plan |
| Schema validation | `javascript` assertion with `ReviewSchema.safeParse` | Zero drift from the real schema, exact enum/range validation, single source of truth | Plan |
| Rubric grader | Fixed gpt-5-mini grader, independent of model under test | Consistent grading across every test case rather than a model grading itself | Plan |
| File layout | `tools/code-review/evals/` subfolder | Colocated with the tool it tests, visually separated from the CLI's own source | Plan |
| CI scope | devDependency + `npm run eval`/`eval:ci` only, no workflow change | Matches the literal task scope; CI wiring is a natural follow-up change | Plan |

## Scope

**In scope:** `promptfooconfig.yaml`, custom provider wrapping the real agent call, one fixture diff, `is-json` + `llm-rubric` + two `javascript` assertions, `promptfoo` devDependency, `npm run eval`/`eval:ci` scripts.

**Out of scope:** Modifying `review.ts`/`review-schema.ts`; wiring the eval into `.github/workflows/`; a second fixture; cross-provider (e.g. Anthropic) model comparison.

## Architecture / Approach

A promptfoo custom `file://` provider (`tools/code-review/evals/provider.ts`) implements `ApiProvider`, importing `REVIEW_SYSTEM_PROMPT`/`ReviewSchema` directly and replicating `review.ts`'s exact `generateText`/`Output.object` call, parameterized by model. The same provider file is listed twice in `promptfooconfig.yaml` with different `config.model`, so one test case (the fixture diff) runs against both models in a single `promptfoo eval` invocation.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scaffolding + provider | `promptfoo` devDependency, `evals/` directory, custom provider wrapping the real agent call | Custom provider's exact constructor/type shape depends on the installed promptfoo version |
| 2. Fixture + assertions | Combined-flaw diff, schema-validity assertion, bad-diff business-rule assertion | Fixture must read as a plausible real diff, not a toy example, for the eval to be meaningful |
| 3. Config + scripts + verify | `promptfooconfig.yaml`, `npm run eval`/`eval:ci`, confirmed failing run | Eval could pass "by construction" if assertions are too lenient — manual verification step guards against this |

**Prerequisites:** `OPENAI_API_KEY` already available (in `.env.local` locally, as a secret in CI) — no new secret needed.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- The exact `ApiProvider` constructor signature and import path come from the installed `promptfoo` package's own types — flagged in the plan's Critical Implementation Details to verify against `node_modules/promptfoo` rather than assume.
- `promptfoo`'s CLI binary needs `node --env-file=.env.local` wrapping locally since it isn't run via `tsx` like the existing `review*` scripts — a deliberate deviation from that pattern, not an oversight.
- This eval is not yet wired into CI — until a follow-up change adds it to a workflow, it only runs on-demand.

## Success Criteria (Summary)

- `npm run eval` fails (non-zero exit) on the intentionally flawed fixture, for both models under test.
- All four assertions (`is-json`, schema validity, bad-diff-fails business rule, `llm-rubric`) pass — i.e. they correctly detect the injected flaws rather than failing for unrelated reasons.
- No changes to `tools/code-review/review.ts` or `review-schema.ts`.
