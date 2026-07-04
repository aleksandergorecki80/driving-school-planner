---
project: "driving-school-planner"
assessed_at: 2026-07-04T18:09:55Z
agent_readiness: ready
context_type: brownfield
stack_components:
  language: TypeScript (strict)
  framework: Next.js 16.2.6 (App Router)
  build_tool: Next.js CLI (Turbopack)
  test_runner: Vitest + Playwright
  package_manager: npm
  ci_provider: null
  deployment_target: Vercel
gates_passed: 4
gates_failed: 0
---

## Stack Components

**Language:** TypeScript ^5, with `strict: true` set in `tsconfig.json`. Applied end-to-end — server actions, React components, Supabase client typings.

**Framework:** Next.js 16.2.6, App Router. Routes and layouts follow the file-based convention (`src/app/**/page.tsx`, `layout.tsx`); server actions live under `src/app/actions/`.

**Build tool:** Next.js's own build pipeline (Turbopack-backed dev/build), invoked via `next dev` / `next build` in `package.json` — no separate bundler configuration.

**Test runner:** Vitest 4.1.9 for unit/integration tests (`vitest.config.ts`, `*.test.ts` co-located with source), Playwright 1.61.1 for E2E (`playwright.config.ts`).

**Package manager:** npm, pinned via `package-lock.json`.

**Backend/data layer:** Supabase (Postgres + Auth) via `@supabase/supabase-js` and `@supabase/ssr`.

**Observability:** Sentry (`@sentry/nextjs`) already wired (instrumentation files, tunnel route).

**CI/CD:** Not detected — no `.github/workflows/`, no other CI config. `lefthook` runs lint + test + typecheck as a local pre-commit hook, but nothing enforces this on push/PR today.

**Deployment:** Vercel — project linked via `.vercel/project.json`.

**Instruction files:** `CLAUDE.md` and `AGENTS.md` present, both substantive (hard rules on path aliases, no Prettier, RSC-by-default, React 19 form handling, commit conventions, plus a project-specific E2E testing skill pointer).

**Assessment scope note:** This assessment evaluates the stack as it exists today. It's run in the context of `context/foundation/prd-v2.md` (the S-02 access-model rework: per-lesson one-time tokens, email delivery, AI-generated rejection-reason suggestions). That PRD's `## Scope of Change` introduces two new external dependencies — an email-sending service and an AI-backed suggestion service — neither of which exists in the codebase yet. Those are new-dependency selections, not part of the current stack being scored below; see the Summary for how to carry them forward.

## Quality Gate Assessment

| Component | Typed | Convention | Training Data | Documented | Verdict |
|-----------|-------|------------|----------------|------------|---------|
| Language (TypeScript) | ✓ | — | — | — | pass |
| Framework (Next.js App Router) | — | ✓ | ✓ | ✓ | pass |
| Build tool (Next.js/Turbopack) | — | ✓ | ✓ | ✓ | pass |
| Test runner (Vitest + Playwright) | — | — | ✓ | ✓ | pass |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

### Gate Details

**Typed — pass.** `tsconfig.json:7` sets `"strict": true`. TypeScript is used end-to-end (components, server actions, Supabase client). No `any`-heavy escape hatches observed in the reviewed files (`lessons.ts`, `office/` components).

**Convention-based — pass.** Next.js App Router enforces file-based routing and a fixed special-file contract (`page.tsx`, `layout.tsx` must sit at their route segment — already a hard-won lesson in this project's own history, per `AGENTS.md`'s Next.js breaking-changes warning). The project also layers its own conventions on top (`src/app/office/components/{sidebar,calendar,lesson-panel}/`), documented implicitly through the existing structure rather than in a written doc — a minor gap, not a framework failure.

**Popular in training data — pass.** Next.js App Router is the dominant React meta-framework in current JS/TS training data. Vitest and Playwright are both mainstream, high-adoption choices in the same ecosystem (Vitest as the modern Vite-native successor to Jest; Playwright as Microsoft's actively-maintained E2E standard). Supabase's client libraries are widely represented as well.

**Well-documented — pass.** Next.js, Vitest, Playwright, and Supabase all ship current, versioned, official documentation. `AGENTS.md` already flags one practical wrinkle: this Next.js version (16.2.6) has recent breaking changes (e.g., `middleware.ts` → `proxy.ts`) not yet reflected in general training data — the project compensates for this itself by instructing agents to check `node_modules/next/dist/docs/` before writing code, which is exactly the right pattern.

## Gaps & Compensation

No quality gate failed. The one soft gap worth naming:

**No CI/CD pipeline.** `lefthook` enforces lint + test + typecheck locally on commit, but nothing re-runs those checks on push or PR — a contributor could bypass the local hook (or push from a machine without it installed) and land unverified code on `main`. This isn't one of the four agent-friendliness gates, but it's directly relevant to this project's own test-plan: issue **#21 ("Quality gates wiring")** in the repo's rollout plan already exists to close this gap. No new compensation needed here — just confirming the existing plan is the right fix.

### Recommended Instruction File Additions

None required — all four gates pass and `CLAUDE.md`/`AGENTS.md` already document the project's real trip-hazards (path aliases, no Prettier, RSC-by-default, React 19 form handling, the Next.js 16 breaking-changes warning). One optional strengthening, not a gate-driven requirement:

```markdown
## Office component structure

`src/app/office/` keeps only `page.tsx` and `layout.tsx` at the route root.
Everything else lives under `src/app/office/components/`, grouped by feature:
`sidebar/`, `calendar/`, `lesson-panel/`. New office UI follows this grouping;
don't add loose files back to the `office/` root.
```

This documents a convention the codebase already follows (post the `refactor/office-components-structure` change) but that isn't written down anywhere — worth adding opportunistically, not because any gate failed.

## Summary

**Overall verdict: ready.** All four agent-friendliness gates pass without qualification — typed end-to-end, strongly convention-based (Next.js App Router), mainstream in training data, and well-documented. This is a stack an agent can work in with minimal steering.

**Key strengths:** TypeScript strict mode everywhere; App Router's file-based structure keeps navigation predictable; existing `AGENTS.md`/`CLAUDE.md` already capture the project's real gotchas (Next.js 16 breaking changes, React 19 form handling) rather than generic advice.

**Key gap:** no CI/CD enforcement — already tracked as issue #21 in this project's own test-plan rollout, not a new finding.

**Not yet assessed:** the two new external dependencies introduced by `prd-v2.md` (email-sending service, AI-backed rejection-reason suggestion service) don't exist in the codebase yet, so they can't be scored against these gates. When a specific provider is chosen for each (a decision this assessment deliberately doesn't make — that's an implementation-planning choice), it's worth a quick sanity check against the same four criteria: does the chosen SDK ship TypeScript types, is its integration pattern well-documented for Next.js server actions, and is it common enough in training data that the agent won't need hand-holding.

**Recommended next step:** `/10x-health-check` — audits dependency health, test suite coverage, and CI/CD posture in more depth than this assessment does.
