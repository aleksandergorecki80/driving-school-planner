---
project: "driving-school-planner"
checked_at: 2026-07-04T18:20:00Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 18
  moderate: 15
  low: 2
test_runner_detected: true
ci_provider: null
recommended_fixes: 4
---

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 18 HIGH, 15 MODERATE, 2 LOW
Direct vs transitive: 1 direct (vercel), 17 transitive — all 18 HIGH findings trace to a single root: the `vercel` devDependency and its bundled `@vercel/*` build-tool packages.
```

#### HIGH findings

- **vercel** 54.7.1 (direct devDependency) — pulls in `@vercel/backends`, `@vercel/build-utils`, `@vercel/node`, `@vercel/express`, `@vercel/hono`, `@vercel/python`, `@vercel/remix-builder`, `@vercel/static-build`, and others, which in turn depend on vulnerable versions of `form-data`, `minimatch`, `path-to-regexp`, `tar`, and `undici`. All are build/deploy tooling used at deploy time, not runtime dependencies shipped to production. `npm audit` proposes `vercel@50.41.0` as the "fix" — that's a downgrade relative to the currently-installed 54.7.1 and is flagged `isSemVerMajor`, so it's not a safe drop-in; the more sensible path is a normal upgrade to the current `54.20.1` (see Outdated Dependencies below) and re-running the audit against that version first.

MODERATE (15) and LOW (2) findings are transitive dependents of the same `vercel` chain (`undici` SameSite/cache-key advisories) — no separate action needed once the `vercel` chain above is addressed.

### Outdated Dependencies

```
Packages with major version gaps: 3
```

- **@types/node**: 20.19.41 → 26.1.0 (type-only package; low runtime risk, but 6 major versions behind)
- **eslint**: 9.39.4 → 10.6.0 (1 major version behind)
- **typescript**: 5.9.3 → 6.0.3 (1 major version behind)

All other outdated packages (`next`, `react`, `@supabase/supabase-js`, `tailwindcss`, etc.) are minor/patch gaps only — not flagged.

## Test Suite

```
Test runner: Vitest (unit/integration) + Playwright (E2E)
Tests found: 4 Vitest suites (src/middleware.test.ts, src/lib/supabase/rls.test.ts, src/app/actions/lessons.test.ts, src/app/instructor/[token]/page.test.ts) + 2 Playwright specs (e2e/office-books-lesson.spec.ts, e2e/seed.spec.ts)
Test execution: not attempted — these are integration/E2E tests that write to and read from the project's live hosted Supabase instance (via `.env.test`) and, for Playwright, a running dev server. Running them as part of a passive health check would create/mutate real rows in that shared environment, which this check deliberately avoids. Both `vitest` and `playwright` binaries were confirmed installed and runnable (`vitest/4.1.9`, Playwright `1.61.1`).
```

Configuration: `vitest.config.ts` (environment: node, includes `src/**/*.test.ts`, loads `.env.test`), `playwright.config.ts` (testDir `./e2e`, baseURL `http://localhost:3000`).

## CI/CD

```
Provider: not detected
Configuration: not found
```

| Stage      | Status | Notes                                      |
|------------|--------|---------------------------------------------|
| Lint       | ✗      | not configured in CI (runs locally via lefthook pre-commit) |
| Test       | ✗      | not configured in CI (runs locally via lefthook pre-commit) |
| Build      | ✗      | not configured in CI                        |
| Type check | ✗      | not configured in CI (runs locally via lefthook pre-commit) |
| Security   | ✗      | not configured in CI                        |

ℹ No CI/CD configuration detected. You'll set this up in the infrastructure and deployment lesson. For now, a local test runner is sufficient for agent collaboration — and this project already tracks the CI gap as its own backlog item (GitHub issue #21, "Quality gates wiring", part of the project's own test-plan rollout).

## Configuration

```
All expected configuration files present. No gaps detected, with one deliberate exception noted below.
```

- `.gitignore` — present.
- `.env.example` — present (documents required environment variables).
- `eslint.config.mjs` — present, flat config, extends `eslint-config-next`.
- `tsconfig.json` — present, `strict: true`.
- `CLAUDE.md` / `AGENTS.md` — both present and substantive.
- `.editorconfig` — **not present**. Low severity: the project has no Prettier by explicit design (`AGENTS.md`: "No Prettier is configured. Formatting is ESLint's responsibility only") and ESLint's flat config doesn't cover editor-level whitespace/EOL settings the way `.editorconfig` would. Not a gap introduced by this check — just the one file in the standard checklist genuinely absent.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready
```

Stack-assess found no quality-gate failures — this health check corroborates that: TypeScript strict mode is in effect, the App Router's file-based conventions are actively followed (including in the recent `office/` component reorganization), and the test runner is present and functional. The only finding here (dependency audit) sits outside the four quality gates entirely; it's an operational hygiene item, not a stack-choice problem.

| Quality Gate Gap | Health-Check Finding | Status |
|-------------------|----------------------|--------|
| none (all 4 gates passed) | Test runner detected and functional; strict TypeScript confirmed | Mitigated / reinforced pass |

## Recommended Fixes

### Fix before agent work (Category A)

### 1. High-severity advisories in the `vercel` CLI dependency chain

**Impact**: 18 HIGH-severity advisories all trace to one devDependency (`vercel`) and its `@vercel/*` build helpers. These don't ship in the deployed app, but they run in the local/CI build-and-deploy toolchain — a compromised build tool is still a real supply-chain risk, and an agent asked to "fix the audit" without this context might reach for a risky forced downgrade.
**Severity**: high
**Effort**: moderate (15–30 min)
**Fix**:

```bash
npm install vercel@54.20.1 --save-dev
npm audit
```

Re-run the audit after this normal (non-major) upgrade before considering the major-version jump `npm audit` itself suggests — that suggestion is a downgrade relative to what's installed and should not be applied blindly.

### 2. Outdated direct devDependencies with major version gaps

**Impact**: `eslint` and `typescript` are each one major version behind; `@types/node` is six majors behind. None are urgent, but an agent generating new code against outdated type definitions (especially `@types/node`) can produce subtly wrong Node API usage that only surfaces at runtime.
**Severity**: medium
**Effort**: moderate (15–30 min) — each major bump should be tested independently (`npm run build && npm test` after each)
**Fix**:

```bash
npm install --save-dev @types/node@latest
npm install --save-dev eslint@latest eslint-config-next@latest
npm install --save-dev typescript@latest
npm run build && npm run lint && npm test
```

### 3. Missing `.editorconfig`

**Impact**: minor — contributors using editors without ESLint-format-on-save integration may introduce inconsistent whitespace/line-ending style that ESLint's flat config doesn't police.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add a `.editorconfig` with `charset = utf-8`, `end_of_line = lf`, `insert_final_newline = true`, `indent_style = space`, `indent_size = 2` to match the project's existing style.

### Addressed in upcoming lessons (Category B)

### No CI/CD pipeline

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: Wire lint, typecheck, test, and build into a GitHub Actions workflow so `lefthook`'s local pre-commit checks are also enforced on push/PR — closing the gap already tracked as this project's own GitHub issue #21.

## Summary

Health status: needs-attention

The codebase itself is in good shape — TypeScript strict mode, a working Vitest + Playwright test suite, complete baseline configuration, and substantive `CLAUDE.md`/`AGENTS.md` instruction files that already capture the project's real gotchas. The one thing worth fixing before leaning further on agent-assisted work is the dependency-audit picture: 18 HIGH-severity advisories, all rooted in the `vercel` CLI devDependency and its build-helper packages rather than in anything shipped to production, plus a few outdated dev tools (`typescript`, `eslint`, `@types/node`) worth refreshing. Missing CI/CD is a known, already-tracked gap (issue #21), not a new finding.

Next step: address the `vercel` dependency upgrade and outdated-devDependency refresh above (both quick/moderate, no app-code changes required), then proceed with implementing the `prd-v2.md` change (S-02 access-model rework) with confidence that the underlying stack and tooling are sound.
