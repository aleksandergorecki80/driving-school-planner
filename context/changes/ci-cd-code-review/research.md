---
date: 2026-08-23T15:40:08+02:00
researcher: Claude (10x-research)
git_commit: a1b1589cab07191741ae3b833d07d3577da7074e
branch: main
repository: aleksandergorecki80/driving-school-planner
topic: "CI/CD code-review agent — wrapping the M5L2 review agent in a GitHub Actions PR gate"
tags: [research, codebase, ci-cd, github-actions, code-review, ai-sdk]
status: complete
last_updated: 2026-08-23
last_updated_by: Claude (10x-research)
---

# Research: CI/CD code-review agent

**Date**: 2026-08-23T15:40:08+02:00
**Researcher**: Claude (10x-research)
**Git Commit**: a1b1589cab07191741ae3b833d07d3577da7074e
**Branch**: main
**Repository**: aleksandergorecki80/driving-school-planner

## Research Question

Based on `context/changes/ci-cd-code-review/requirements.md`: what does the codebase
already provide toward a GitHub Actions PR-gate that wraps the existing M5L2 code-review
agent, and what specifically is missing/needs to be built?

## Summary

The M5L2 agent (`tools/code-review/review.ts` + `review-schema.ts`, [PR #56](https://github.com/aleksandergorecki80/driving-school-planner/commit/a1b1589cab07191741ae3b833d07d3577da7074e)) is a complete, working CLI reviewer: it reads a diff from stdin, calls `generateText` with `Output.object({ schema: ReviewSchema })` via the Vercel AI SDK, and prints the structured JSON (5 scores + verdict + summary) to stdout. It is genuinely reusable as-is — **no source changes are required** to satisfy the requirements, only a new invocation path and everything CI-side around it.

The repository has **zero existing CI/CD infrastructure** — no `.github/workflows/`, no `.github/actions/`, no `.nvmrc`. This is confirmed independently by `context/foundation/stack-assessment.md` and `context/foundation/tech-stack.md`. Vercel deploys via its own native GitHub App integration (not a GitHub Actions workflow), so this will be the **first** GitHub Actions workflow in the repo — there is no existing deploy/build workflow to coordinate with or avoid duplicating, and no risk of colliding with Vercel's own PR checks beyond both posting to the same PR (different bot identities, no conflict).

Everything in the requirements doc is buildable from what exists today; the main design decision left open is **how to feed PR title/body into an agent whose prompt hardcodes `"Review this git diff:\n\n${diff}"`** — see Open Questions.

## Detailed Findings

### The existing review agent (`tools/code-review/`)

- [`tools/code-review/review.ts`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/tools/code-review/review.ts) — reads the entire diff from stdin (`readStdin()`, lines 5-9), exits 1 with a Polish usage message if stdin is empty (lines 13-18), resolves the model via `process.env.AI_SUGGESTION_MODEL ?? 'gpt-5.4-nano'` (line 20), calls `generateText` with a 60s `AbortSignal.timeout` (line 27), and prints `JSON.stringify(output, null, 2)` to stdout (line 30). On any failure it `console.error`s and `process.exit(1)`s (lines 33-36) — this exit code is exactly what a CI step needs to gate on.
- [`tools/code-review/review-schema.ts`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/tools/code-review/review-schema.ts) — `REVIEW_SYSTEM_PROMPT` (lines 3-12) already matches the requirements' 5 criteria word-for-word (correctness, idiomaticity, complexity, testCoverage, security) and instructs `verdict: "fail"` on any serious problem. `ReviewSchema` (lines 14-24) is a Zod object: `scores.{correctness,idiomaticity,complexity,testCoverage,security}` each `z.number().min(1).max(10)`, `verdict: z.enum(['pass','fail'])`, `summary: z.string()`. This is the exact shape a CI step needs to parse for the PR comment + label logic.
- The agent takes **only a diff** today — there is no parameter for PR title/body. The prompt template (`review.ts:26`) is a single hardcoded string; nothing reads `process.argv` or additional env vars for extra context.

### How the agent is invoked today (npm scripts)

[`package.json:15-19`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/package.json#L15-L19) defines 5 scripts, all wrapping `npx tsx --env-file=.env.local tools/code-review/review.ts` with a different diff source piped in (`review`, `review:working`, `review:staged`, `review:head`, `review:branch`). All of them assume a local `.env.local` file — **none of them are CI-safe as-is**, confirming the requirement to add a `review:ci` variant without `--env-file`. `npx tsx` is already the established runner (no compiled build step, no separate CI build needed for this tool).

### Env var conventions

- [`.env.example`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/.env.example#L26-L32) documents exactly the two vars the reviewer needs: `OPENAI_API_KEY` (server-only) and `AI_SUGGESTION_MODEL` (optional, defaults to a small/cheap model — pointing at [`src/lib/ai/suggestRejectionReasons.ts`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/src/lib/ai/suggestRejectionReasons.ts#L15) as the sibling pattern, which uses the identical `process.env.AI_SUGGESTION_MODEL ?? 'gpt-5.4-nano'` fallback). These are the exact secret/env-var names to wire into the workflow (`OPENAI_API_KEY` as a repo secret, `AI_SUGGESTION_MODEL` optionally as a workflow env pinned to a cheap model id).
- The current fallback model (`gpt-5.4-nano`) is already the "cheap model" the requirements ask for — CI can likely omit `AI_SUGGESTION_MODEL` entirely and rely on the code default, or set it explicitly in the workflow for clarity/pinning.
- `.gitignore` (lines 33-35) ignores all `.env*` except `.env.example` — no secrets are at risk of being committed by this change as long as no new `.env.ci`-style file is added.

### CI/CD state of the repo (confirmed absent)

- No `.github/` directory exists at all (`ls .github/workflows` / `.github/actions` both fail with "No such file or directory").
- [`context/foundation/stack-assessment.md:34`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/context/foundation/stack-assessment.md#L34) explicitly states: *"CI/CD: Not detected — no `.github/workflows/`, no other CI config. `lefthook` runs lint + test + typecheck as a local pre-commit hook, but nothing enforces this on push/PR today."* This new workflow will be the **first** enforcement point on PRs in this repo.
- [`context/foundation/tech-stack.md:9-10`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/context/foundation/tech-stack.md#L8-L10) declares `ci_provider: github-actions` / `ci_default_flow: auto-deploy-on-merge` at the planning level, but [`context/foundation/infrastructure.md:142`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/context/foundation/infrastructure.md#L142) clarifies deploy itself is *"a deploy step, not covered here"* and line 85 confirms Vercel deploys via its own dashboard/marketplace integration, not an Actions workflow. **No existing GitHub Actions workflow deploys or builds this app** — this AI-review workflow does not need to coordinate with or avoid duplicating any existing pipeline.
- Vercel's own GitHub App will independently comment/post deployment-status checks on the same PRs; this is a separate bot identity from whatever posts the AI-review comment, so no collision — but if the review job re-runs (e.g. via the `ai-cr:review` label), the workflow should **update/replace its own prior comment** rather than appending a new one each time, to avoid PR-comment spam.

### Environment/tooling constraints relevant to the workflow

- **Node**: no `.nvmrc` exists at the repo root (`find . -maxdepth 1 -name ".nvmrc"` — empty). Local `node -v` is `v24.10.0`. `package.json` has no `engines` field pinning a version. The requirements explicitly call for adding `.nvmrc` so `actions/setup-node` resolves the right version.
- **Package manager**: `package-lock.json` is present (no `pnpm-lock.yaml`/`yarn.lock`) — this is an `npm ci` project; `actions/setup-node`'s `cache: 'npm'` applies directly.
- **TypeScript config**: [`tsconfig.json`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/tsconfig.json) includes `**/*.ts` broadly (no exclusion of `tools/`), so `tools/code-review/*.ts` is already part of the type-checked project — `npm run typecheck` already covers it, no separate config needed for CI to type-check the reviewer itself.
- **ESLint**: [`eslint.config.mjs`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/eslint.config.mjs) only globally ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts` — `tools/` is not excluded, so any new composite-action helper `.ts`/`.js` files added under `tools/` (if the wrapper needs one) would be linted by the existing `next/core-web-vitals` + `next/typescript` config; a plain shell/YAML composite action avoids this entirely.
- **Test runner**: [`lefthook.yml`](https://github.com/aleksandergorecki80/driving-school-planner/blob/a1b1589cab07191741ae3b833d07d3577da7074e/lefthook.yml) runs `lint`, `typecheck`, `test` (`vitest run`) as local pre-commit hooks only — confirms the requirement's note that `npm run test` depends on nothing server-related for the unit suite itself, but the requirements doc separately flags that **some** npm-run-test-adjacent flow needs a dev server (likely Playwright E2E, gated elsewhere) — worth confirming in planning whether `npm run test` (vitest) is actually server-dependent or if the constraint is about a different script; either way the requirements say not to run it in this workflow, so it's moot for this change.
- **GitHub labels**: `gh label list` shows only GitHub's default set (`bug`, `documentation`, `enhancement`, etc.) plus a repo-added `post-MVP` label. **`ai-cr:passed` and `ai-cr:failed` do not exist yet** — the workflow (or a one-time setup step) must create them before first use, or the label-set step will fail on a nonexistent label.
- **Repo identity**: `gh repo view` resolves `aleksandergorecki80/driving-school-planner` correctly even though the git remote URL uses an SSH config alias (`git@aleksandergorecki80:...`) rather than `github.com` — this is a local SSH-config quirk only; it has no effect on GitHub Actions, which runs against the real GitHub repo regardless of how the developer's local git remote is aliased.

## Code References

- `tools/code-review/review.ts:1-36` - the CLI entrypoint: stdin diff → `generateText` → JSON stdout, exit-code-driven failure
- `tools/code-review/review-schema.ts:1-27` - `REVIEW_SYSTEM_PROMPT` and `ReviewSchema` (5 criteria + verdict + summary)
- `package.json:15-19` - existing `review*` npm scripts, all `--env-file=.env.local` (not CI-safe)
- `.env.example:26-32` - `OPENAI_API_KEY` / `AI_SUGGESTION_MODEL` env var contract
- `src/lib/ai/suggestRejectionReasons.ts:15` - sibling pattern using the same `AI_SUGGESTION_MODEL` fallback convention
- `context/foundation/stack-assessment.md:34` - explicit "no CI/CD detected" finding
- `context/foundation/infrastructure.md:85,142` - Vercel deploys via dashboard/marketplace integration, not Actions; deploy workflow explicitly out of scope of infra research
- `lefthook.yml:1-8` - local-only pre-commit gate (lint, typecheck, test) that this PR-gate workflow will be the first server-side enforcement to parallel/supersede on PRs
- `tsconfig.json` / `eslint.config.mjs` - confirm `tools/**` is already type-checked and linted by existing scripts, no new tooling config needed

## Architecture Insights

- The M5L2 agent was deliberately designed as a thin, stdin-in/JSON-out CLI (mirroring `suggestRejectionReasons.ts`'s model-selection pattern) — this shape is what makes it trivially wrappable in CI: any composite action step just needs to produce the right stdin and capture stdout, no refactor of the agent needed.
- The repo's only quality gates today are local (`lefthook` pre-commit). This change is the first shift from "local-only, best-effort" to "server-side, PR-blocking" enforcement — worth flagging in planning since it changes contributor workflow (a red `ai-cr:failed` becomes a visible, shared signal instead of something only the committer's machine ever saw).
- Env-var handling in this codebase has an established convention (small cheap-model fallback in code + optional override via a plain env var, documented in `.env.example`) that the CI wiring should follow exactly rather than reinvent (e.g. no need for a CI-specific model env var name).

## Historical Context (from prior changes)

- No dedicated change folder exists for the M5L2 agent itself — it landed as a direct, self-contained commit ([`a1b1589`](https://github.com/aleksandergorecki80/driving-school-planner/commit/a1b1589cab07191741ae3b833d07d3577da7074e), PR #56), not through the `/10x-plan` → `/10x-implement` flow, so there is no `plan.md`/`research.md` precedent to cross-check against for that agent's design rationale beyond its commit message and the code itself.
- `context/foundation/infrastructure.md` (from `/10x-infra-research`) already anticipated `ci_provider: github-actions` at the platform-selection stage but scoped actual CI/CD workflow authoring out of that research — this change is the first concrete implementation of that placeholder.
- No other in-flight change folder (`context/changes/*`) references `.github`, `workflow_dispatch`, or `ai-cr` labels — no overlapping or conflicting in-flight work.

## Related Research

- None — this is the first research artifact for `ci-cd-code-review`.

## Open Questions

1. **How should PR title/body reach the agent without modifying `review.ts`?** The requirements say "do not rewrite it — wrap it," but `review.ts`'s prompt is hardcoded to `"Review this git diff:\n\n${diff}"` and its only input channel is stdin. Two wrapping options, both requiring zero source changes:
   - Concatenate title + body + diff into a single text blob before piping to stdin (the agent will treat the whole blob as "the diff" — works today, but slightly abuses the prompt's framing and system prompt, which explicitly says "You receive a git diff").
   - Accept a small, additive change to `review.ts` (e.g. optional `TITLE`/`BODY` env vars appended to the prompt before the diff) — technically a "rewrite," but minimal and additive; worth clarifying with the user whether "do not rewrite" strictly forbids any diff to `review.ts`/`review-schema.ts`, or just forbids re-architecting them.
   This should be resolved explicitly in `/10x-plan` before implementation.
2. **Comment upsert vs. append on re-run**: the requirements specify re-run via the `ai-cr:review` label but don't say whether the PR comment should be replaced or a new one posted each time. Given labels are also being toggled (`ai-cr:passed`/`ai-cr:failed`), an upsert (find-and-edit-existing-comment by a hidden marker, e.g. an HTML comment tag) is the standard low-noise pattern — worth confirming as a plan decision.
3. **Label bootstrap**: `ai-cr:passed`/`ai-cr:failed` labels don't exist in the repo yet. Decide whether the workflow creates them idempotently on each run (`gh label create --force` / `actions/github-script` upsert) or whether they're created once out-of-band before the workflow ships.
