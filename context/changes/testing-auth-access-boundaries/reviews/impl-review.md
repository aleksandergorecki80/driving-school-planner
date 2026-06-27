<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth & Access Boundaries Integration Tests

- **Plan**: context/changes/testing-auth-access-boundaries/plan.md
- **Scope**: All phases (1–4 of 4)
- **Date**: 2026-06-27
- **Verdict**: NEEDS ATTENTION → all findings resolved during triage
- **Findings**: 0 critical · 4 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — SECURITY DEFINER function missing SET search_path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260627000001_add_access_policies.sql:16
- **Detail**: SECURITY DEFINER function without a fixed search_path is flagged by Supabase's security guidance. The function runs as the postgres superuser role; without `SET search_path = public`, a caller with CREATE SCHEMA privileges could shadow `public.instructors` or `public.lessons`.
- **Fix Applied**: Fix A — new migration `20260627000003_fix_security_definer_explicit_columns.sql` re-creates the function with `SET search_path = public`. Applied to hosted project.
- **Decision**: FIXED via Fix A

### F2 — SELECT * exposes future columns to anon role

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260627000001_add_access_policies.sql:33
- **Detail**: `RETURN QUERY SELECT * FROM lessons` is GRANT EXECUTE'd to the anon role. Any column added to lessons in a future migration is automatically exposed to unauthenticated callers with no policy review.
- **Fix Applied**: Fix A — `20260627000003` replaces `SELECT *` with explicit column list: `id, instructor_id, student_id, category, scheduled_at, status, rejection_reason, created_at`. Applied to hosted project.
- **Decision**: FIXED via Fix A

### F3 — beforeAll partial failure leaves orphaned seed rows

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase/rls.test.ts:22
- **Detail**: The cleanup array was populated in a batch after all seed calls. A mid-way throw left successfully-seeded rows untracked. The shared test database could accumulate orphaned rows.
- **Fix Applied**: Restructured `beforeAll` — FK parents (instructors, students) are pushed to cleanup immediately after creation (at the END of the array for correct FK teardown order); lesson rows are `unshift`'d to the FRONT. Deletion order: lessonB → lessonA → instructorA → instructorB → student.
- **Decision**: FIXED

### F4 — Plan claimed Vitest auto-loads .env.test; implementation uses loadEnv()

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: vitest.config.ts:4 / plan.md Phase 1 §2
- **Detail**: Plan stated "Vitest loads .env.test automatically." In practice, Vitest's automatic loading filters by the `VITE_` prefix, silently dropping `NEXT_PUBLIC_*` and `SUPABASE_*` vars. The implementation is correct; the plan text was inaccurate and risked a future contributor removing `loadEnv()` as "redundant."
- **Fix Applied**: Updated plan.md Phase 1 §2 comment with the correct `loadEnv()` rationale and the empty-prefix explanation.
- **Decision**: FIXED

### F5 — test-client.ts uses @supabase/supabase-js, not @supabase/ssr (undocumented)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/supabase/test-client.ts:1
- **Detail**: Intentional divergence from the project's @supabase/ssr pattern was undocumented.
- **Fix Applied**: Added one-line comment explaining the deliberate choice.
- **Decision**: FIXED

### F6 — Non-null assertions on env vars (no early error on missing .env.test)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase/test-client.ts:4
- **Detail**: `process.env.*!` silences TypeScript but passes `undefined` through to `createClient`, producing a confusing library error rather than a descriptive setup message.
- **Fix Applied**: Added a guard block that validates all three required env vars at module load time and throws with a "copy .env.test and fill in values" message if any are absent.
- **Decision**: FIXED
