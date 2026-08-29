---
change_id: ci-cd-code-review
title: CI/CD code-review agent — wrap the M5L2 scripted reviewer in a GitHub Actions PR gate
status: implemented
created: 2026-08-23
updated: 2026-08-29
archived_at: null
---

## Notes

MVP scope: composite GitHub Action wrapping `tools/code-review/review.ts` (M5L2 agent),
triggered on PRs to `main` + `workflow_dispatch` + the `ai-cr:review` label. Posts a PR
comment with scores/verdict and sets `ai-cr:passed`/`ai-cr:failed` labels. See
`requirements.md` for full scope and constraints; `research.md` for codebase findings.

Shipped in PR #57 (merged 2026-08-23). All Progress checkboxes in `plan.md` closed
2026-08-29, verified against real production data rather than a dedicated test PR:
PR #57 (comment/label/re-run/label-consume behavior across 9 commits + 3
`workflow_dispatch` runs) and PR #58 (a real `context_length_exceeded` agent error —
the accepted large-diff tradeoff — stood in for a deliberately forced error, and
behaved correctly: check failed, no label change, clear "could not complete" comment).
`main` branch protection confirmed still unconfigured, as designed.

**Outstanding, not blocking:** the security checklist's live injection-probe PR (a
self-PR with a shell-injection-shaped title, to empirically prove the `env:`
indirection holds under a real GitHub Actions run) has not been executed — only
confirmed by static code inspection so far. Recommend running it before fully
trusting the gate on adversarial input, or before flipping on branch-protection
required-checks.
