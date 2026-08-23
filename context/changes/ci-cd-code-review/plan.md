# CI/CD Code-Review Agent Implementation Plan

## Overview

Wrap the existing M5L2 scripted review agent (`tools/code-review/review.ts` +
`review-schema.ts`) in a GitHub Actions workflow that runs the agent against every
pull request to `main`, posts an auto-updating PR comment with the per-criterion
scores and verdict, and applies a state label (`ai-cr:passed` / `ai-cr:failed`) —
giving the repo its first automated PR-review signal without touching the agent's
source.

## Current State Analysis

- The agent (`tools/code-review/review.ts:1-36`, `tools/code-review/review-schema.ts:1-27`)
  is a complete, working CLI: reads a diff from stdin, calls `generateText` with
  `Output.object({ schema: ReviewSchema })`, prints JSON to stdout, exits non-zero on
  failure. It already scores exactly the 5 criteria the requirements specify and
  already defaults to a cheap model (`process.env.AI_SUGGESTION_MODEL ?? 'gpt-5.4-nano'`).
  It takes **only a diff** — no channel for PR title/body.
- All 5 existing `review*` npm scripts (`package.json:15-19`) hardcode
  `--env-file=.env.local`, which doesn't exist in CI — none are CI-safe as-is.
- `.env.example:26-32` documents `OPENAI_API_KEY` and `AI_SUGGESTION_MODEL` as the
  exact env vars the agent reads; these are the names to wire as CI secrets/env.
- The repo has **no `.github/` directory at all** (confirmed:
  `context/foundation/stack-assessment.md:34`) and **no `.nvmrc`**. `main` has **no
  branch protection** (`gh api repos/.../branches/main/protection` → 404, verified
  during planning). Vercel deploys via its own GitHub App, not an Actions workflow
  (`context/foundation/infrastructure.md:85,142`) — there is nothing existing to
  coordinate with or avoid duplicating.
- `ai-cr:passed` / `ai-cr:failed` labels do not exist yet (`gh label list` shows only
  GitHub defaults + `post-MVP`).
- No repo secrets are configured (`gh secret list` is empty) — `OPENAI_API_KEY` must
  be added manually; this plan cannot do that step (requires the actual key value).
- `actionlint` and `shellcheck` are installed locally and available as automated
  verification for the new YAML/shell (`actionlint` auto-invokes `shellcheck` on
  embedded `run:` blocks when it's in `PATH`).

## Desired End State

Opening (or updating) a PR against `main` automatically runs a job that:

- posts one PR comment (created on first run, edited in place on every subsequent
  run) showing the 5 criterion scores, verdict, and summary;
- applies `ai-cr:passed` (verdict `pass`) or `ai-cr:failed` (verdict `fail`),
  removing the other so label state never goes stale; if the agent itself failed to
  run or returned output that doesn't match `ReviewSchema`, no label is applied or
  changed — the PR keeps whatever `ai-cr:*` label it already had — and the comment
  explains the review didn't run;
- fails the GitHub check (non-zero) whenever the verdict is `fail` **or** the agent
  errored, and passes only on verdict `pass`.

The same job can be re-run on-demand two ways: `workflow_dispatch` with a `pr_number`
input (for testing without needing a fresh PR), and adding the `ai-cr:review` label
to an existing PR (which the job consumes/removes after running, so it can be
re-added later).

**Verification**: open a small real PR against `main`, confirm the comment/label
appear; re-run via `workflow_dispatch` against that same PR number; add `ai-cr:review`
to confirm label-triggered re-run + self-removal; temporarily break the model id to
confirm the agent-error path comments correctly (no label change) and still fails
the check.
Branch protection is **not** configured as part of this plan — see What We're NOT
Doing.

### Key Discoveries

- `tools/code-review/review.ts:22-28` — the prompt is a single hardcoded string
  (`` `Review this git diff:\n\n${diff}` ``); anything piped to stdin is treated as
  "the diff," so title/body can be prepended into the same stdin blob with zero
  source changes (confirmed approach — chosen over an additive code change).
- `.gitignore:33-35` ignores all `.env*` except `.env.example` — no risk of secrets
  being committed by this change.
- `tsconfig.json` and `eslint.config.mjs` already cover `tools/**` — no new lint/type
  config needed for the agent itself; this change adds no new `.ts` files.

## What We're NOT Doing

- Not modifying `tools/code-review/review.ts` or `review-schema.ts` in any way.
- Not implementing the parked criteria (business alignment, architectural fit,
  plan-adherence review) — out of MVP scope per `requirements.md`.
- Not running `npm run test` (vitest) or any dev-server-dependent check in this
  workflow.
- Not configuring branch protection / required status checks on `main` — the check
  will exist and fail correctly, but nothing enforces it yet. This is a deliberate,
  user-chosen follow-up: validate the reviewer's judgment on real PRs first, then
  flip on "require status checks" manually once trusted.
- Not handling PRs from forks specially (no fork contributors on this solo-dev repo);
  using the plain `pull_request` trigger, not `pull_request_target`.
- Not building a general CI pipeline (lint/typecheck/build workflow) — this change
  adds only the AI-review gate.
- Not adding any diff-size limit, truncation, or per-run cost guard. Every PR to
  `main` now sends its full diff+title+body automatically (previously this was
  opt-in, self-limited by whoever ran `npm run review:*` manually). An unusually
  large PR either costs more per run than typical, or exceeds the model's context
  window and safely falls into the agent-error path (Critical Implementation
  Details) rather than crashing — accepted as a known MVP tradeoff, not solved here.

## Implementation Approach

One new composite action (`.github/actions/ai-reviewer/`) owns all the review logic —
diff/context assembly, running the agent, and every GitHub side-effect (comment,
labels, exit code) — so the workflow file itself stays a thin trigger + checkout +
"call the action" shell, reusable across repos later per the requirements. The
workflow resolves the acting PR's context (number/title/body/head SHA) once, up
front, in a way that's identical in shape for both the `pull_request` event and
`workflow_dispatch`, so the composite action never needs to know which trigger fired.

## Critical Implementation Details

- **PR title/body are untrusted input — script-injection risk.** `github.event.pull_request.title`
  and `.body` are attacker-controllable strings. They must be passed into steps via
  an `env:` mapping (e.g. `env: { PR_TITLE: ${{ github.event.pull_request.title }} }`)
  and referenced in shell as `"$PR_TITLE"`, never interpolated directly as
  `${{ github.event.pull_request.title }}` inside a `run:` script body — the latter
  is the classic GitHub Actions script-injection pattern (a title containing
  `` $(curl ...) `` or backticks would execute). This applies everywhere title/body
  touch a shell step, including inside the composite action.
- **Multi-line values through `GITHUB_OUTPUT` need the delimiter form.** PR bodies
  are multi-line; writing them to `$GITHUB_OUTPUT` requires the randomized-heredoc
  pattern (`name<<DELIM` / body / `DELIM`, with `DELIM` freshly generated per write,
  e.g. from `uuidgen` or `$RANDOM`) rather than a plain `echo "name=$VALUE" >>`, which
  breaks (and is itself injectable) on embedded newlines or `=`.
- **Checkout ref must be the PR head SHA, not the default merge ref.** For the
  `pull_request` event, `actions/checkout` without an explicit `ref` checks out the
  synthetic `refs/pull/N/merge` commit by default. Explicitly set
  `ref: ${{ github.event.pull_request.head.sha }}` (or the head SHA resolved via
  `gh pr view` for `workflow_dispatch`) so `git diff origin/main...HEAD` diffs the
  actual PR commits. `fetch-depth: 0` is still required regardless (per
  `requirements.md`) so `origin/main` exists locally to diff against.
- **`ai-cr:passed` / `ai-cr:failed` must stay mutually exclusive, and are only
  touched on a real verdict.** On `pass`/`fail`, apply the matching label and remove
  the other one, so a PR that once failed and now passes doesn't show both. On an
  agent error (no verdict was produced), leave both labels untouched — don't apply
  either — the PR simply keeps whatever `ai-cr:*` label it already had; the comment
  is what signals the run didn't actually complete.
- **The `ai-cr:review` trigger label is consumed, not a status.** Only proceed on a
  `labeled` event when `github.event.label.name == 'ai-cr:review'` (skip the job for
  any other label change), and remove that label at the end of a successful run so
  it can be re-added later to trigger another review.
- **Ordering constraint**: PR-context resolution (which needs `gh pr view` for
  `workflow_dispatch`, or is free from the event payload for `pull_request`) must
  happen **before** checkout, since checkout needs the resolved head SHA.

## Security checklist (verify all before rollout)

This workflow runs attacker-influenced input on a runner that holds repo secrets, so
treat it as a security-sensitive surface. Every box below must be checked during
implementation (Phase 2/3) and re-confirmed in `/10x-plan-review`:

- [ ] **1. Untrusted input only via `env:`, never raw `${{ }}` in `run:`.** PR title,
  body, branch name — anything an author controls — is passed through an `env:` mapping
  and referenced as `"$VAR"` in shell (and read via `process.env.*` in the agent). No
  attacker-controlled expression is ever interpolated directly into a `run:` script
  body. (Expands the first Critical Implementation Details bullet into a hard gate.)
- [ ] **2. Minimal `permissions:` on the workflow.** Set the least scope the job needs —
  `contents: read` + `pull-requests: write` (comment + labels) — instead of the default
  broad `GITHUB_TOKEN`. Limits blast radius if anything still leaks.
- [ ] **3. All third-party actions pinned to a verified commit SHA**, not a moving tag.
  Each `uses:` points at `@<sha>`, and each SHA is confirmed to actually correspond to
  the intended release (checked on the action's repo — do not trust an unverified hash).
- [ ] **4. Trigger is `pull_request`, never `pull_request_target`.** The latter exposes
  secrets to fork PRs. Solo repo with no forks today; revisit only if forks ever target
  this repo.
- [ ] **5. `OPENAI_API_KEY` scoped to the agent step only**, via that step's `env:` —
  not exported at job level — so the secret's exposure surface is one step, not the
  whole job.

**Verification (Phase 4):** open a self-PR whose title is a benign injection probe, e.g.
`` test"; echo INJECTED > /tmp/pwned; echo " `` — confirm the title appears as plain
text in the comment/logs and that `INJECTED` is **not** executed. That is the empirical
proof safeguard #1 holds.

## Phase 1: Local CI-safe invocation

### Overview

Make the agent runnable in CI (no `--env-file`) and pin the Node version, without
touching the agent's own source.

### Changes Required:

#### 1. Node version pin

**File**: `.nvmrc` (new)

**Intent**: Give `actions/setup-node` (and any local `nvm use`) a single source of
truth for the Node version, matching what the project already runs on.

**Contract**: File contains the major version currently in use (Node 24), consumable
by `setup-node`'s `node-version-file` input (which accepts `.nvmrc` natively).

#### 2. CI-safe review script

**File**: `package.json`

**Intent**: Add a `review:ci` script that mirrors `review` but drops `--env-file`, so
the agent reads `OPENAI_API_KEY` / `AI_SUGGESTION_MODEL` from whatever environment
invokes it (CI env vars) instead of a local dotenv file.

**Contract**: New script `"review:ci": "npx tsx tools/code-review/review.ts"` — same
entrypoint as the existing `review` script, stdin contract unchanged (still expects a
diff-shaped string on stdin). Existing `review*` scripts are untouched.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification:

- `OPENAI_API_KEY=<real key> git diff | npm run review:ci` (run from a shell with no
  `.env.local` sourced, or with `.env.local` temporarily renamed) produces the same
  JSON shape as `npm run review:working` does today.
- `nvm use` (or equivalent) in the repo root picks up the version from `.nvmrc`
  without error.

---

## Phase 2: Composite action (`ai-reviewer`)

### Overview

Build the reusable composite action that does the actual review: assemble
title+body+diff, run `review:ci`, classify the result, and apply every GitHub
side-effect (comment, labels).

### Changes Required:

#### 1. Composite action definition

**File**: `.github/actions/ai-reviewer/action.yml` (new)

**Intent**: Single entry point the workflow calls once per run, encapsulating all
review logic so the workflow file stays a thin trigger/checkout shell and the action
is reusable across repos later.

**Contract**: `runs.using: composite`. Inputs: `pr-number` (string, required),
`pr-title` (string, required, may be empty), `pr-body` (string, required, may be
empty), `github-token` (string, required — used for `gh` CLI calls), `openai-api-key`
(string, required, secret), `consumed-review-label` (string `'true'`/`'false'`,
required — whether to remove the `ai-cr:review` label after this run). Output:
`verdict` (`pass` | `fail` | `error`).

#### 2. Diff + context assembly step

**Intent**: Produce the exact stdin the agent expects: title, body, and the PR diff
concatenated into one text blob, using the base-branch diff constraint from
`requirements.md`.

**Contract**: Runs `git diff origin/main...HEAD` (repo already checked out with
`fetch-depth: 0` by the calling workflow at this point) and prepends the (env-indirected,
per Critical Implementation Details) title/body ahead of the diff, writing the result
to a file for the next step to consume — never inlining title/body directly into a
shell command string.

#### 3. Agent invocation + result classification step

**Intent**: Run the agent against the assembled input and determine one of three
outcomes: `pass`, `fail` (agent ran, returned `verdict: "fail"`), or `error` (agent
exited non-zero, or stdout wasn't valid JSON matching `ReviewSchema`'s shape).

**Contract**: Invokes `npm run review:ci` with `OPENAI_API_KEY`/`AI_SUGGESTION_MODEL`
set from the action's inputs, piping in the file from step 2, capturing stdout and
exit code. Downstream steps consume the classification (`pass`/`fail`/`error`) plus,
when available, the parsed `scores`/`verdict`/`summary` object.

#### 4. Label upsert step

**Intent**: Ensure the two state labels exist (idempotent, safe to run every time).
On a `pass`/`fail` classification, apply the matching one and remove the other so
label state stays exclusive (per Critical Implementation Details). On an `error`
classification, skip this step entirely — no label is applied or removed. Also
removes `ai-cr:review` when `consumed-review-label` is `'true'`.

**Contract**: `ai-cr:passed` (green), `ai-cr:failed` (red, matching the existing
`bug` label's red) — created via the GitHub API if missing, applied/removed via the
GitHub API against `pr-number`, authenticated with
`github-token`.

#### 5. PR comment upsert step

**Intent**: Post or update a single PR comment reflecting the latest run, never
accumulating duplicate comments across re-runs.

**Contract**: Comment body includes a hidden marker (e.g. `<!-- ai-cr-comment -->`),
a scores table (or a clear "review failed to run" explanation for the `error` case),
the verdict, and the summary. The step lists existing PR comments, finds one
containing the marker, and edits it in place via the GitHub API if found, otherwise
creates a new one.

#### 6. Exit code

**Intent**: Make the composite action itself fail (non-zero) whenever classification
is `fail` or `error`, so the calling workflow job — and therefore the GitHub check —
reports red exactly when the requirements say it should ("a `fail` on any serious
criterion... blocks the merge gate").

**Contract**: Final step exits `1` for `fail`/`error` classifications, `0` for `pass`,
after the comment/label steps have already run (side-effects must happen regardless
of the eventual exit code).

### Success Criteria:

#### Automated Verification:

- `actionlint .github/actions/ai-reviewer/action.yml` passes (also runs `shellcheck`
  on embedded `run:` blocks, both installed locally)

#### Manual Verification:

- Not independently runnable without a workflow to invoke it — verified together
  with Phase 3/4's end-to-end run.

---

## Phase 3: Workflow (`ai-review.yml`)

### Overview

The thin trigger/infra layer: decide when to run, resolve PR context for both
trigger shapes, prepare the workspace, and call the composite action with pinned,
minimal permissions.

### Changes Required:

#### 1. Workflow definition

**File**: `.github/workflows/ai-review.yml` (new)

**Intent**: Fire the review on every PR to `main` (open/update/reopen), on the
`ai-cr:review` label being added, and on manual `workflow_dispatch` against an
existing PR number — routing all three into the same job.

**Contract**: `on.pull_request: { branches: [main], types: [opened, synchronize,
reopened, labeled] }` plus `on.workflow_dispatch.inputs.pr_number` (required,
`type: number`). Top-level `permissions: { contents: read, pull-requests: write }`
(no more than needed for checkout + comment/label writes). Job-level `if:` skips
the run when `github.event.action == 'labeled'` and the label isn't `ai-cr:review`.

#### 2. PR-context resolution step

**Intent**: Produce a uniform `{number, title, body, head_sha}` regardless of which
trigger fired, per the ordering constraint in Critical Implementation Details.

**Contract**: For `pull_request`, values come straight from
`github.event.pull_request.*` (via `env:` indirection, per the injection note). For
`workflow_dispatch`, resolved via `gh pr view "$PR_NUMBER" --json
number,title,body,headRefOid` using `github.token`. Outputs written through
`$GITHUB_OUTPUT` using the multi-line-safe delimiter form for `title`/`body`.

#### 3. Checkout step

**Intent**: Get the exact PR head commit, with full history so `origin/main` is
diffable.

**Contract**: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (pinned SHA
for `v7.0.1`), `with: { ref: <resolved head_sha from step 2>, fetch-depth: 0 }`.

#### 4. Node setup + install

**Intent**: Match the project's Node version and install dependencies before running
the agent.

**Contract**: `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (pinned
SHA for `v7.0.0`), `with: { node-version-file: '.nvmrc', cache: 'npm' }`, followed by
`npm ci`.

#### 5. Invoke composite action

**Intent**: Hand off to Phase 2's action with everything it needs.

**Contract**: `uses: ./.github/actions/ai-reviewer` with `pr-number`/`pr-title`/
`pr-body` from step 2's outputs, `github-token: ${{ github.token }}`,
`openai-api-key: ${{ secrets.OPENAI_API_KEY }}`, `consumed-review-label:` a boolean
expression true only when this run was triggered by the `ai-cr:review` label being
added.

### Success Criteria:

#### Automated Verification:

- `actionlint .github/workflows/ai-review.yml` passes

#### Manual Verification:

- Verified end-to-end together with Phase 4.

---

## Phase 4: Rollout & manual verification

### Overview

Wire up the one thing code can't provide (the real API key), then exercise every
trigger path against a real PR before considering this done.

### Changes Required:

#### 1. Repo secret

**Intent**: The workflow needs a real OpenAI key to call the model.

**Contract**: `OPENAI_API_KEY` added as a repository secret (GitHub Settings →
Secrets and variables → Actions, or `gh secret set OPENAI_API_KEY`) — manual, human
action; not part of any file in this repo. Do this **before** opening the PR that
ships this change itself, not only before the dedicated test PR below: GitHub runs
`pull_request`-triggered workflows using the workflow file version on the PR's own
branch, so this change's own PR will trigger the new workflow on itself the moment
it's opened. Without the secret set first, that first run is an unplanned
agent-error (harmless, but avoidable).

### Success Criteria:

#### Automated Verification:

- N/A (this phase is verification, not new code)

#### Manual Verification:

- Open a small real PR against `main`: confirm exactly one PR comment appears with
  scores/verdict/summary, and exactly one `ai-cr:*` label is applied matching the
  verdict.
- Push an additional commit to that PR: confirm the same comment is edited in place
  (not duplicated) and the label updates if the verdict changes.
- Trigger `workflow_dispatch` with that PR's number: confirm it produces the same
  comment/label outcome as the automatic run.
- Add the `ai-cr:review` label to the PR: confirm the job re-runs and the label is
  removed afterward.
- Temporarily set `AI_SUGGESTION_MODEL` (or otherwise force a failure, e.g. an
  invalid model id) to confirm the agent-error path: the check fails, any existing
  `ai-cr:passed`/`ai-cr:failed` label is left untouched, and the comment clearly
  explains the review didn't run — then revert.
- Confirm `main`'s branch protection is still unconfigured (expected — deliberately
  deferred) and note the manual follow-up: enable "require status checks to pass"
  for this job once its judgment is trusted on real PRs.

---

## Testing Strategy

### Unit Tests:

- None — no new application code (`tools/code-review/*.ts` is unchanged); the new
  surface is YAML + shell, verified via `actionlint`/`shellcheck` (Automated
  Verification above) rather than a unit-test framework.

### Integration Tests:

- Phase 4's manual verification steps are the integration test for this change —
  there is no local GitHub Actions runner in this repo's toolchain (`act` is not
  installed) to automate this further.

### Manual Testing Steps:

1. Open a real PR to `main` and confirm comment + label.
2. Push a follow-up commit; confirm comment is updated in place, not duplicated.
3. Re-run via `workflow_dispatch` with the PR number.
4. Add the `ai-cr:review` label; confirm re-run + label self-removal.
5. Force an agent error; confirm the check still fails, no label changes, and the
   comment explains the review didn't run.

## Performance Considerations

The agent already bounds itself with a 60s `AbortSignal.timeout` (`review.ts:27`);
no additional timeout handling is needed at the workflow level. `actions/setup-node`'s
`cache: 'npm'` keeps `npm ci` fast on repeat runs.

## Migration Notes

Not applicable — this is new infrastructure with no prior state to migrate. The
two `ai-cr:*` labels are created idempotently on first use; no existing PRs are
retroactively labeled.

## References

- Research: `context/changes/ci-cd-code-review/research.md`
- Requirements: `context/changes/ci-cd-code-review/requirements.md`
- Agent source: `tools/code-review/review.ts:1-36`, `tools/code-review/review-schema.ts:1-27`
- Sibling env-var pattern: `src/lib/ai/suggestRejectionReasons.ts:15`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Local CI-safe invocation

#### Automated

- [x] 1.1 Typecheck passes: `npm run typecheck` — 26f0f65
- [x] 1.2 Lint passes: `npm run lint` — 26f0f65

#### Manual

- [x] 1.3 `OPENAI_API_KEY=<real key> git diff | npm run review:ci` (no `.env.local`) produces the same JSON shape as `npm run review:working` — 26f0f65
- [x] 1.4 `nvm use` picks up the version from `.nvmrc` without error — 26f0f65

### Phase 2: Composite action (`ai-reviewer`)

#### Automated

- [x] 2.1 `actionlint .github/actions/ai-reviewer/action.yml` passes (incl. embedded shellcheck)

#### Manual

- [x] 2.2 Verified together with Phase 3/4's end-to-end run (not independently runnable)

### Phase 3: Workflow (`ai-review.yml`)

#### Automated

- [ ] 3.1 `actionlint .github/workflows/ai-review.yml` passes

#### Manual

- [ ] 3.2 Verified end-to-end together with Phase 4

### Phase 4: Rollout & manual verification

#### Manual

- [ ] 4.1 Real PR to `main` produces exactly one comment + one matching `ai-cr:*` label
- [ ] 4.2 Follow-up commit edits the same comment in place (no duplicate) and updates the label if verdict changes
- [ ] 4.3 `workflow_dispatch` against that PR number produces the same outcome
- [ ] 4.4 Adding `ai-cr:review` label re-runs the job and the label is removed afterward
- [ ] 4.5 Forced agent error fails the check with no label change and a clear "review didn't run" comment, then reverted
- [ ] 4.6 Confirmed `main` branch protection remains unconfigured (deferred by design) and follow-up noted
