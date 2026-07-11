<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Instructor Responds (S-02 rework) — Phase 8

- **Plan**: context/changes/instructor-responds/plan.md
- **Scope**: Phase 8 of 9 (Office polling — 30s auto-refresh)
- **Date**: 2026-07-11
- **Verdict**: NEEDS ATTENTION (both findings fixed during triage)
- **Findings**: 0 critical, 2 warnings, 0 observations — both FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Automated checks (re-run during this review)

- `npm run build` — exit 0 ✅
- `npm run lint` — exit 0 ✅
- `npx vitest run` — 7 files, 48 tests passed ✅ (see F2 — this currently passes only because a `next dev` server happened to already be running locally)

## Findings

### F1 — office/page.test.ts cleanup runs in FK-violating order, leaks orphaned rows

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/office/page.test.ts:70-84 (cleanup array construction), :62-65 (afterAll)
- **Detail**: The test pushes `{table: 'instructors'}` and `{table: 'students'}` onto the shared `cleanup` array before the lesson row that references them, then runs one `cleanupRows(svc, cleanup)` in `afterAll`. `cleanupRows` deletes strictly in array order (src/lib/supabase/test-client.ts:86-96) and only `console.warn`s on failure — it doesn't reorder or retry. Re-running the full suite just now reproduced the failure live:
  ```
  cleanupRows: failed to delete instructors/f858d898-...: update or delete on table "instructors" violates foreign key constraint "lessons_instructor_id_fkey" on table "lessons"
  cleanupRows: failed to delete students/79b9ecda-...: update or delete on table "students" violates foreign key constraint "lessons_student_id_fkey" on table "lessons"
  ```
  The lesson row deletes fine afterward (nothing references it), but the instructor/student rows are left behind permanently — every run of this test leaks one instructor + one student row. Every other integration test file in the suite gets this ordering right: `lessons.test.ts` deletes its `lessonIds` before `suiteCleanup` (lessons.test.ts:117,122), and `lesson/[token]/page.test.ts` deletes `lessonCleanup` before `suiteCleanup` (page.test.ts:33-35) — the established convention is child-rows-first.
- **Fix**: Push the lesson cleanup entry first (or split into two `cleanupRows` calls, lessons then instructor/student), mirroring `lesson/[token]/page.test.ts`'s `lessonCleanup` → `suiteCleanup` ordering.
- **Decision**: FIXED — split into `lessonCleanup`/`suiteCleanup` arrays, deleted lessons first in `afterAll`. Re-ran the test in isolation; no more FK-violation warnings on stderr.

### F2 — vitest.config.ts's `webServer` block is not a real Vitest option; HTTP-fetch tests silently depend on a manually-running dev server

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: vitest.config.ts:15-20; src/app/office/page.test.ts (new consumer of the assumption), src/middleware.test.ts (pre-existing consumer)
- **Detail**: `test.webServer` isn't a recognized Vitest 4 config key (that shape belongs to Playwright) — grepping the installed `vitest` package turns up nothing that reads it, and there's no `globalSetup` implementing the behavior manually. It's inert: nothing spawns or waits for a dev server before the run. `npm test` only exited 0 just now because a `next dev` process was already listening on :3000 in this environment. Phase 8 adds a second test file (`office/page.test.ts`) that `fetch()`s `TEST_BASE_URL`/`localhost:3000` directly, doubling the surface that depends on this unstated precondition, without noticing or documenting it. `context/foundation/test-plan.md:163` states `npm run test` is meant to work as "a single run (CI **and** pre-commit)", and `test-plan.md:75` plans to "Lock lint + typecheck + integration + e2e gates in CI" — on a fresh checkout or a real CI runner with no dev server already up, both `middleware.test.ts` and `office/page.test.ts` would fail with connection errors, contradicting Phase 8's own "`npm test` exits 0" success criterion the moment CI is wired up.
- **Fix A ⭐ Recommended**: Replace the inert `webServer` block with a real Vitest `globalSetup` that checks if something is already listening on the configured port and, if not, spawns `next dev` (or a prebuilt `next start`), polls until it responds, and tears it down after the run.
  - Strength: Makes `npm test` genuinely self-contained, matching what `test-plan.md` already commits to for CI.
  - Tradeoff: Adds real test-harness complexity (process spawn, readiness polling, teardown) and lengthens a from-cold `npm test` by however long the server takes to become ready.
  - Confidence: MED — no `.github/workflows` exists yet, so nothing is broken in practice today; this is pre-emptive for when CI lands.
  - Blind spot: Haven't checked whether `next dev` vs `next start` changes any cookie/auth behavior the tests rely on.
- **Fix B**: Delete the dead `webServer` block and document in the README/AGENTS.md that `npm run dev` must be running in another terminal before `npm test`.
  - Strength: One-line change; makes the already-true requirement explicit instead of silently assumed.
  - Tradeoff: `npm test` still isn't a single self-contained command — a future CI setup needs its own server-start step regardless.
  - Confidence: HIGH — matches how the tests already behave today.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — added `vitest.global-setup.ts` (checks if `TEST_BASE_URL`/`localhost:3000` is already up; if not, spawns `npm run dev` detached, polls until ready, tears down via `process.kill(-pid)` after the run) and wired it via `test.globalSetup` in `vitest.config.ts`, replacing the inert `webServer` block. Verified: (1) `npx vitest run` still passes 48/48 using the already-running dev server (reuse path), (2) spawn/wait/teardown logic verified standalone against a throwaway HTTP server on an unused port — comes up, becomes reachable, and cleanly stops on teardown. `npm run build`/`npm run lint` still exit 0.

## Notes

- This is a pre-existing gap (the `webServer` block and the HTTP-fetch pattern both originate in `auth-scaffold`'s `middleware.test.ts`), not something Phase 8 introduced from scratch — but Phase 8 is the second file to build on it, and its own success criteria depend on it, so it's in-scope here.
- F1 is scoped entirely to the new file added in this phase.
