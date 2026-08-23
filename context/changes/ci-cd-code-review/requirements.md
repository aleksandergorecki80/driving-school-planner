# Requirements: CI/CD code-review agent

Brainstorm note (input to `/10x-research` and `/10x-plan`). Scope is a deliberately
narrow MVP — a pipeline equivalent of an MVP, grown iteratively later.

## Overall concept

- A GitHub Actions workflow that runs on every pull request to `main` (plus manual
  `workflow_dispatch` so it can be tested without opening a PR).
- The review logic itself lives in a **composite action** (start local under
  `.github/actions/ai-reviewer/`) so the main workflow stays easy to reason about and
  the reviewer can later be reused across repos.
- **Reuse the existing agent** built in M5L2: `tools/code-review/review.ts` +
  `tools/code-review/review-schema.ts` (Vercel AI SDK, `Output.object`, structured JSON).
  Do not rewrite it — wrap it for CI.

## Input parameters (what the agent receives)

- pull request title (`github.event.pull_request.title`)
- pull request description / body (`github.event.pull_request.body`) — noted as a
  conscious cost tradeoff (more tokens)
- `git diff` of the PR against the base branch (`git diff origin/main...HEAD`)

## Code review criteria

Each criterion scored 1–10 (1 = worst, 10 = best). Same schema as the local agent
(`ReviewSchema`); each criterion has an explicit "1" and "10" state so scoring is not
arbitrary.

- **correctness** — 1: introduces obvious bugs / breaks intent; 10: does exactly what it
  intends, no defects.
- **idiomaticity** — 1: fights TS/React/Next conventions; 10: idiomatic for this stack
  (App Router, RSC-by-default, `@/*` alias, no deprecated APIs like `FormEvent`).
- **complexity** — 1: needlessly complex / over-abstracted; 10: as simple as the problem
  allows.
- **testCoverage** — 1: touches behavior with zero tests; 10: changed behavior is
  covered (co-located `*.test.ts`). Docs-only diffs are exempt (no false "fail").
- **security** — 1: injection / auth bypass / data exposure / leaked secret; 10: no such
  risk (mind Supabase RLS, service-role key, `NEXT_PUBLIC_*` boundaries).

Overall `verdict`: `pass` / `fail`. A `fail` on any serious criterion (esp. security)
blocks the merge gate.

## Parked for later (not in MVP)

- **business alignment** — requires broader product context than a diff.
- **architectural fit** — requires broader context than a diff.
- **plan-adherence review** — comparing the diff against its `context/changes/<id>/plan.md`
  (the `10x-impl-review-ci` idea); needs the agent to read the plan. Defer.

## Expected side-effects

- A PR comment with the review summary + per-criterion scores + verdict.
- Labels: `ai-cr:passed` (green) OR `ai-cr:failed` (red), driven by the verdict.

## Expected behavior

- On-demand re-run when the label `ai-cr:review` is added to the PR.

## Constraints / environment notes (specific to this repo)

- **Auth path for the key:** local dev uses `--env-file=.env.local`; **CI must NOT** —
  the key comes from a repo secret (`OPENAI_API_KEY`) injected as an env var. Add a
  CI-only invocation (e.g. `review:ci` = `npx tsx tools/code-review/review.ts`, no
  `--env-file`) so the same agent reads the key from the CI environment.
- **Diff needs full history:** `actions/checkout` is shallow by default — use
  `fetch-depth: 0`, otherwise `git diff origin/main...HEAD` is empty.
- **Pin third-party actions to a commit SHA** (`@<sha>`), not a moving tag — the action
  runs with access to repo secrets.
- **Node:** provide a `.nvmrc` so `actions/setup-node` uses the right version
  (project currently runs on Node 24; this repo has no `.nvmrc` yet).
- **Do NOT run `npm run test` in this workflow** — it depends on a dev server on a local
  port and is out of scope here; the review job only needs the diff + the agent.
- Model comes from `AI_SUGGESTION_MODEL` (fallback in code); pick a cheap model for
  per-PR runs to keep cost low.
