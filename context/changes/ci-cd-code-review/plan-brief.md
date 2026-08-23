# CI/CD Code-Review Agent — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Wrap the existing M5L2 review agent (`tools/code-review/review.ts`) in a GitHub
Actions workflow so every PR to `main` gets an automated code review — scored
correctness/idiomaticity/complexity/testCoverage/security, a pass/fail verdict, and
a PR comment — instead of relying only on the local, opt-in `npm run review*`
scripts and a lefthook pre-commit hook nothing on the server side enforces today.

## Starting Point

The agent itself is done and requires no changes — it's a stdin-diff-in, JSON-out
CLI that already matches the requirements' schema and already defaults to a cheap
model. What's missing is entirely CI plumbing: the repo has **zero** `.github/`
infrastructure, no `.nvmrc`, no `ai-cr:*` labels, and no branch protection on `main`.

## Desired End State

Opening a PR to `main` triggers a job that posts one auto-updating comment (scores +
verdict + summary) and applies `ai-cr:passed` or `ai-cr:failed` on a real verdict
(if the agent itself errors, no label changes — the comment explains it). The check
can be re-run manually (`workflow_dispatch` + PR number) or on-demand (adding the
`ai-cr:review` label, which removes itself after running). The check fails whenever
the verdict is `fail` or the agent itself errors — but nothing yet blocks merging on
that (see Open Risks).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Feeding title/body to the agent | Concatenate title+body+diff into one stdin blob | Zero changes to `review.ts`, matches "reuse, don't rewrite" | Plan |
| Re-run comment behavior | Upsert via hidden HTML marker | Avoids comment spam across repeated re-runs | Plan |
| Agent-error vs. genuine `fail` | Both fail the check; agent-error changes no label (only `pass`/`fail` touch labels) and explains itself via comment | Never silently pass a PR just because the API had a bad day, without adding a third label beyond what requirements specify | Plan (revised in plan review) |
| `workflow_dispatch` input | Required `pr_number`, resolves full PR context via `gh pr view` | Exercises the exact same code path as a real PR trigger — a genuine smoke test | Plan |
| Label bootstrap | Composite action creates `ai-cr:*` labels idempotently if missing | Workflow is self-contained, no manual setup step | Plan |
| Branch protection | Not configured in this change — deliberate manual follow-up | Avoid a solo dev getting locked out of `main` by an unproven, un-trusted reviewer | Plan |

## Scope

**In scope:**
- `.nvmrc`, `review:ci` npm script
- `.github/actions/ai-reviewer/` composite action (diff assembly, agent invocation,
  comment/label upsert, exit-code gating)
- `.github/workflows/ai-review.yml` (triggers, checkout, node setup, invocation)
- Manual rollout: `OPENAI_API_KEY` secret + real end-to-end verification

**Out of scope:**
- Any change to `tools/code-review/review.ts` / `review-schema.ts`
- Business-alignment, architectural-fit, plan-adherence review criteria (parked)
- Running `npm run test` in this workflow
- Branch protection / required-status-check configuration on `main`
- Fork-PR handling (`pull_request_target`) — solo-dev repo, no forks
- Diff-size limits / per-run cost guards — every PR sends its full diff+title+body;
  accepted as a known MVP tradeoff (see Open Risks)

## Architecture / Approach

A thin workflow file resolves PR context (uniformly, for both the `pull_request`
event and `workflow_dispatch`), checks out the exact PR head SHA with full history,
installs deps, then delegates everything else — diff assembly, running the agent,
comment/label side-effects, and the pass/fail exit code — to one composite action at
`.github/actions/ai-reviewer/`, keeping the review logic reusable across repos later.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Local CI-safe invocation | `.nvmrc` + `review:ci` script | Low — additive, no behavior change to existing scripts |
| 2. Composite action | All review logic: diff/context assembly, agent run, comment/label upsert, exit code | Script-injection via untrusted PR title/body if `env:` indirection is skipped |
| 3. Workflow | Triggers, PR-context resolution, checkout/node setup, invocation | Wrong checkout ref (merge commit vs. head SHA) silently diffs the wrong commits |
| 4. Rollout & verification | Real secret + full end-to-end manual pass across all trigger paths | Nothing verifies this without a real PR — no local Actions runner (`act`) available |

**Prerequisites:** `OPENAI_API_KEY` value from the user (cannot be added by the plan
itself); a throwaway/real PR to test against.
**Estimated effort:** ~1 session across 4 phases — mostly YAML/shell, no application
code changes.

## Open Risks & Assumptions

- No branch protection means "blocks the merge gate" (per requirements) is not
  literally enforced yet — the check exists and fails correctly, but a human can
  still merge past a red check until protection is turned on manually.
- No local GitHub Actions runner (`act`) is installed — Phase 2/3's "automated"
  verification is limited to `actionlint`/`shellcheck` static checks; true
  correctness is only proven by Phase 4's real-PR run.
- Assumes no fork-based PRs will ever target this repo (solo-dev project) — if that
  ever changes, the `pull_request` trigger + direct secret exposure would need
  revisiting.
- No diff-size guard: an unusually large PR either costs more per run than typical,
  or exceeds the model's context window and safely falls into the agent-error path
  rather than crashing — an accepted MVP tradeoff, not solved here.
- The PR that ships this change will trigger the new workflow on itself the moment
  it's opened (GitHub uses the workflow file version on the PR's own branch) —
  `OPENAI_API_KEY` must be set as a repo secret before opening it, not only before
  Phase 4's dedicated test PR.

## Success Criteria (Summary)

- Every PR to `main` gets exactly one auto-updating AI review comment and exactly one
  correct `ai-cr:*` label, with the check failing on `fail`/`error` outcomes.
- All three trigger paths (`pull_request`, `workflow_dispatch`, `ai-cr:review` label)
  produce the same correct outcome, verified against a real PR.
