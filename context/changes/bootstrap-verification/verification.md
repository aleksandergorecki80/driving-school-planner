---
bootstrapped_at: 2026-05-23T14:00:00Z
starter_id: next
starter_name: Next.js
project_name: driving-school-planner
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: next
package_manager: npm
project_name: driving-school-planner
hints:
  language_family: js
  team_size: solo
  deployment_target: vercel
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

A solo developer shipping a driving-school lesson-scheduling MVP in 6 after-hours weeks needs a full-stack, TypeScript-first, agent-friendly starter with auth in scope. Next.js was chosen on the custom path after reviewing the quality-gated candidate set: it passes all four agent-friendly gates (typed via TypeScript, convention-based App Router file routing, popular in JS training data, current versioned docs) and carries verified bootstrapper confidence — scaffolding will be smooth. Supabase is the intended data and auth layer (PostgreSQL for the lesson, instructor, and student data; Supabase Auth for the office email+password account; URL token access for instructors handled at the application layer). Supabase is added post-scaffold via the official Supabase Next.js integration rather than being pre-wired in the starter — one deliberate setup step the developer owns. Deployment targets Vercel (first in Next.js defaults) with GitHub Actions auto-deploy on merge. No payments, realtime push, AI, or background jobs in scope per PRD non-goals.

## Pre-scaffold verification

| Signal      | Value                                        | Severity | Notes                                           |
| ----------- | -------------------------------------------- | -------- | ----------------------------------------------- |
| npm package | create-next-app v16.2.6 published 2026-05-23 | fresh    | resolved from cmd_template                      |
| GitHub repo | not run                                      | n/a      | docs_url (nextjs.org) is not a GitHub URL       |

## Scaffold log

**Resolved invocation**: `npx create-next-app@latest bootstrap-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`

> Note: `create-next-app` rejects names beginning with a period (npm naming restriction). The temp directory was named `bootstrap-scaffold` (no leading dot) rather than `.bootstrap-scaffold`. Behaviour is identical to the `subdir-then-move` strategy in all other respects.

**Strategy**: subdir-then-move
**Exit code**: 0
**Files moved**: 14 top-level entries (`.gitignore`, `.next/`, `AGENTS.md`, `README.md`, `eslint.config.mjs`, `next-env.d.ts`, `next.config.ts`, `node_modules/`, `package-lock.json`, `package.json`, `postcss.config.mjs`, `public/`, `src/`, `tsconfig.json`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md` → `CLAUDE.md.scaffold`
**.gitignore handling**: moved silently (no `.gitignore` existed in cwd)
**bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 2 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/1/0 direct of total 0/0/2/0 (1 MODERATE is a direct `next` advisory via a transitive `postcss` dependency; 1 MODERATE is the underlying `postcss` transitive finding)

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

**1. next** (direct)
- Advisory via: `postcss < 8.5.10`
- Affects range: `9.3.4-canary.0 – 16.3.0-canary.5`
- Root cause: transitive `postcss` bundled inside `next/node_modules/postcss`
- Fix: `npm audit fix --force` would downgrade to `next@9.3.3` (semver major — not recommended); upstream fix expected in the next `next` patch release when bundled postcss is updated

**2. postcss** (transitive, inside `next/node_modules/postcss`)
- Advisory: GHSA-qx2v-qp2m-jg93 — PostCSS XSS via Unescaped `</style>` in CSS Stringify Output
- CVSS: 6.1 (AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N)
- CWE: CWE-79
- Severity: MODERATE
- Affected range: `< 8.5.10`
- Fix version: `postcss >= 8.5.10` — but requires the upstream `next` package to update its bundled copy

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| bootstrapper_confidence | verified                                                                                  |
| quality_override        | false                                                                                     |
| path_taken              | custom                                                                                    |
| self_check_answers      | typed: true, from_official_starter: true, conventions: true, docs_current: true, can_judge_agent: false |
| team_size               | solo                                                                                      |
| deployment_target       | vercel                                                                                    |
| ci_provider             | github-actions                                                                            |
| ci_default_flow         | auto-deploy-on-merge                                                                      |
| has_auth                | true                                                                                      |
| has_payments            | false                                                                                     |
| has_realtime            | false                                                                                     |
| has_ai                  | false                                                                                     |
| has_background_jobs     | false                                                                                     |

These hints were read into bootstrapper's working memory and are recorded here for completeness. A future M1L4 skill ("Memory Architecture") will act on these — for example, wiring up the Supabase auth integration signalled by `has_auth: true` and `deployment_target: vercel`.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- Review `CLAUDE.md.scaffold` (the version the Next.js starter generated) against your existing `CLAUDE.md` and decide whether to merge any content.
- Add Supabase: `npx @supabase/ssr` or follow the official Supabase + Next.js integration guide — `has_auth: true` is in the hand-off but bootstrapper does not wire it up in v1.
- Address the 2 MODERATE audit findings per your project's risk tolerance — both trace back to a bundled `postcss` in `next` and will resolve in an upstream `next` patch; monitor the Next.js changelog.
- Verify your Vercel + GitHub Actions deploy chain (`deployment_target: vercel`, `ci_provider: github-actions`, `ci_default_flow: auto-deploy-on-merge`).
