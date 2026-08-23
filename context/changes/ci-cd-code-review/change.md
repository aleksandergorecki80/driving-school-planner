---
change_id: ci-cd-code-review
title: CI/CD code-review agent — wrap the M5L2 scripted reviewer in a GitHub Actions PR gate
status: implementing
created: 2026-08-23
updated: 2026-08-23
archived_at: null
---

## Notes

MVP scope: composite GitHub Action wrapping `tools/code-review/review.ts` (M5L2 agent),
triggered on PRs to `main` + `workflow_dispatch` + the `ai-cr:review` label. Posts a PR
comment with scores/verdict and sets `ai-cr:passed`/`ai-cr:failed` labels. See
`requirements.md` for full scope and constraints; `research.md` for codebase findings.
