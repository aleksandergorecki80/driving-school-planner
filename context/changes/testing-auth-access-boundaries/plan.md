# Auth & Access Boundaries Integration Tests — Phase 1 Implementation Plan

## Overview

Bootstrap Vitest as the integration test runner and prove the two auth access boundaries
from the test plan's Phase 1:

- **Risk #1 (IDOR)** — instructor A's token cannot retrieve instructor B's lessons.
  Proved at the data layer via a `SECURITY DEFINER` PostgreSQL function that enforces
  token → instructor_id → lessons scoping atomically.
- **Risk #6 (unauthenticated office access)** — an unauthenticated HTTP request to any
  `/office/*` route receives a `302` redirect to `/login?next=...`.
  Proved as a pending HTTP test that activates when F-02 ships the middleware.

The plan uses a hybrid execution model: data-layer tests run immediately after Phase 2;
pending HTTP tests are written now as acceptance criteria for F-02 and S-02.

---

## Current State Analysis

- **F-01 complete**: `instructors`, `students`, `lessons` tables created; 5 instructor
  seed rows with auto-generated `token` UUIDs; RLS enabled on all three tables;
  zero RLS policies (default-deny posture); Supabase client utilities at
  `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts`.
- **F-02 proposed, not started**: no `middleware.ts`, no `/login` route, no office or
  instructor route folders, no Supabase Auth sessions.
- **Vitest not installed**: no `vitest.config.ts`, no test scripts in `package.json`.
- **Service role key available but unused**: `SUPABASE_SERVICE_ROLE_KEY` is in
  `.env.example` but never imported in application code.
- **`lessons.instructor_id`** is a FK to `instructors.id` (not the token column). Any
  correct scoping must filter by `instructor_id`, not by the token directly.

---

## Desired End State

After this plan is complete:

- `npm run test` runs and all non-pending tests pass.
- Two data-layer integration tests prove Risk #1: instructor A's token cannot retrieve
  instructor B's lessons; an unknown token returns an empty set.
- A `src/middleware.test.ts` documents the Risk #6 HTTP contract (pending until F-02).
- A `src/app/instructor/[token]/page.test.ts` documents the Risk #1 HTTP contract
  (pending until F-02 and S-02 ship the route).
- `§6.1` of `context/foundation/test-plan.md` contains the actual Vitest patterns and
  run command so future contributors know how to add integration tests.

### Key Discoveries

- `instructors.token` — `uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()`. Token is a
  separate column; it resolves to `instructor_id` (PK) via a lookup step.
  `supabase/migrations/20260614143835_initial_schema.sql:9`
- RLS `ENABLE`d on all tables, zero `CREATE POLICY` statements — default-deny with the
  anon key today. `supabase/migrations/20260614143835_initial_schema.sql:34-37`
- `src/lib/supabase/client.ts` carries `'use client'` — cannot be imported in Node.js
  test files. The test utilities must use `createClient` from `@supabase/supabase-js`
  directly.
- Custom session variable approach (`set_config`) is **not feasible** with PostgREST:
  each JS client call opens a new transaction, so the variable does not persist to the
  next call. See Critical Implementation Details.
- Supabase test client must use the anon key for assertions (to exercise the real
  data-access path) and the service role key for setup/teardown/oracle reads.

---

## What We're NOT Doing

- No Supabase Auth for office users — that is F-02's scope.
- No approve/reject server actions — that is S-02's scope.
- No CI pipeline wiring — that is Phase 4 of the test plan (`testing-quality-gates`).
- No Playwright e2e tests — that is Phase 3 of the test plan.
- No local Supabase setup (Docker) — using the hosted project per test-plan §4.
- No middleware implementation — that is F-02's scope.
- No instructor route implementation — that is F-02 + S-02's scope.

---

## Implementation Approach

**Hybrid**: build what can be tested now (data layer, via a `SECURITY DEFINER` function
and RLS policies for the office role) and write pending contracts for what can't
(middleware and route handlers).

The SECURITY DEFINER function (`get_instructor_lessons`) enforces
`token → instructor_id → lessons` scoping atomically in a single database call — no
session variable plumbing needed. RLS policies for the `authenticated` role are written
now as no-ops (Supabase Auth doesn't exist yet) and activate automatically when F-02
ships sessions.

---

## Critical Implementation Details

**Why `set_config` was rejected for instructor scoping.** PostgREST creates one
PostgreSQL transaction per HTTP request. `set_config('app.instructor_id', id, true)` is
transaction-local — it evaporates before the next `supabase.from('lessons')` call lands
in its own transaction. Using `SECURITY DEFINER` and placing the token lookup and the
lesson query inside a single PL/pgSQL function resolves this: the entire operation runs
in one atomic transaction.

**`SECURITY DEFINER` grants.** The function runs as its owner (the `postgres` role in
Supabase), bypassing RLS. Scoping is enforced by the function body. `GRANT EXECUTE ON
FUNCTION get_instructor_lessons(uuid) TO anon` allows the anon-key client to call it.
Do NOT grant SELECT on `lessons` to the `anon` role directly — that would bypass the
scoping entirely.

**`.env.test` must not be committed.** It contains `SUPABASE_SERVICE_ROLE_KEY` — a
server-only credential that bypasses RLS. Add `.env.test` and `.env.test.local` to
`.gitignore` before creating the file.

**Lesson FK order during seeding.** `lessons.student_id` is a FK to `students.id`.
Seed order must be: students → instructors → lessons. Teardown order must be reversed:
lessons → instructors + students.

---

## Phase 1: Vitest Bootstrap and Shared Test Utilities

### Overview

Install the test runner, configure it for Next.js App Router's TypeScript path aliases,
and create the shared utilities that every test in this project will use to seed and
clean up data.

### Changes Required

#### 1. Install test-runner packages

**File**: `package.json` (devDependencies section, via npm install)

**Intent**: Add Vitest, its V8 coverage provider, and the Vite plugin that reads the
project's `tsconfig.json` to resolve `@/*` → `src/*` aliases.

**Contract**: After installation these packages appear in `package.json` devDependencies:
`vitest`, `@vitest/coverage-v8`, `vite-tsconfig-paths`.
`@supabase/supabase-js` is already present in production dependencies — verify it is
there before installing a duplicate.

```
npm install -D vitest @vitest/coverage-v8 vite-tsconfig-paths
```

---

#### 2. Create `vitest.config.ts`

**File**: `vitest.config.ts` (project root, new file)

**Intent**: Configure Vitest to run in the Node.js environment (all Phase 1–3 tests are
server-side), resolve path aliases, and discover test files by the co-location convention
from AGENTS.md (`*.test.ts` beside source files under `src/`).

**Contract**:

```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

Vitest loads `.env.test` automatically in test mode — no explicit `dotenv` call needed.

---

#### 3. Add test scripts to `package.json`

**File**: `package.json` (scripts section)

**Intent**: Expose `npm run test` for CI (single run) and `npm run test:watch` for
local development iteration.

**Contract**: Add to the `"scripts"` object:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

---

#### 4. Create `.env.test` and add it to `.gitignore`

**File**: `.env.test` (project root, new file — DO NOT commit)

**Intent**: Provide test-scoped Supabase credentials separate from the development
`.env.local`. The service role key in this file bypasses RLS — it is used only by the
test utilities for fixture management and oracle reads.

**Contract**: Add to `.gitignore` before creating the file:
```
.env.test
.env.test.local
```

Create `.env.test` with the same variable names as `.env.example`. For Phase 1, the
test project can be the same hosted Supabase project as development — seed + teardown
in `beforeAll`/`afterAll` provides sufficient isolation. A dedicated test project is
optional and can be wired later by changing these values.

```
NEXT_PUBLIC_SUPABASE_URL=<same or dedicated test project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key — never commit>
```

---

#### 5. Create `src/lib/supabase/test-client.ts`

**File**: `src/lib/supabase/test-client.ts` (new file)

**Intent**: Centralize all test-only Supabase client creation, seed helpers, and cleanup
so individual test files stay focused on assertions. Two clients are exposed: a service
role client (bypasses RLS, used for setup/teardown/oracle) and an anon client (exercises
the real data-access path, used for assertions).

**Contract**: Export these functions:

- `createTestServiceRoleClient()` — `createClient(url, serviceRoleKey)` from
  `@supabase/supabase-js`. No cookie handling.
- `createTestAnonClient()` — `createClient(url, anonKey)` from `@supabase/supabase-js`.
  Exercises the same code path as the deployed application's anon-key requests.
- `seedInstructor(client, overrides?)` — inserts one row into `instructors`, returns
  `{id, token, name, categories}`. Uses a unique name by default
  (`test-instructor-<randomUUID>`) to avoid cross-test conflicts.
- `seedStudent(client, overrides?)` — inserts one row into `students`, returns `{id}`.
- `seedLesson(client, instructorId, studentId, overrides?)` — inserts one row into
  `lessons` with `status: 'pending'`, returns `{id}`.
- `cleanupRows(client, rows: {table: string, id: string}[])` — deletes each row by ID.
  Call in `afterAll` in reverse insert order: lessons first, then instructors and
  students.

---

### Success Criteria

#### Automated Verification

- `npm run test` exits with code 0 (no tests yet, but the runner starts and finds no
  errors in config or missing modules).
- `npm run build` passes — adding `vitest.config.ts` introduces no TypeScript errors.

#### Manual Verification

- `.env.test` is listed in `.gitignore` (run `git status` — it must not appear as an
  untracked file).
- `node_modules/vitest` exists after install.

**Implementation Note**: After all automated verification passes, confirm manually that
`.env.test` is gitignored before proceeding to Phase 2.

---

## Phase 2: RLS Migration, SECURITY DEFINER Function, and Data-Layer Tests

### Overview

Write and apply a Supabase migration that adds RLS policies for office users (activated
by F-02's Supabase Auth sessions) and a `SECURITY DEFINER` function for instructor
token-scoped lesson access. Then write the data-layer integration tests that run against
this function to prove Risk #1.

### Changes Required

#### 1. Create the access-policy migration

**File**: `supabase/migrations/20260627000001_add_access_policies.sql` (new file)

**Intent**: Add RLS policies so that once F-02 ships Supabase Auth, office users
automatically gain full read access. Add the `get_instructor_lessons` function so
instructor token-scoped lesson reads are enforced at the database layer.

**Contract**:

Part A — Office user RLS (no-op today; activates with F-02's authenticated sessions):
```sql
-- Office staff (Supabase Auth session) can read all lessons, instructors, and students.
-- These policies are no-ops until F-02 adds authenticated sessions.
CREATE POLICY "office_select_lessons"
  ON lessons FOR SELECT TO authenticated USING (true);

CREATE POLICY "office_select_instructors"
  ON instructors FOR SELECT TO authenticated USING (true);

CREATE POLICY "office_select_students"
  ON students FOR SELECT TO authenticated USING (true);
```

Part B — Instructor lesson access via `SECURITY DEFINER` function:
```sql
-- Token resolves to instructor_id; returns only that instructor's lessons.
-- SECURITY DEFINER runs as the function owner (postgres role), bypassing RLS.
-- Scoping is enforced inside the function body — not by a policy.
CREATE OR REPLACE FUNCTION get_instructor_lessons(p_token uuid)
RETURNS SETOF lessons
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_instructor_id uuid;
BEGIN
  SELECT id INTO v_instructor_id
  FROM instructors
  WHERE token = p_token;

  IF v_instructor_id IS NULL THEN
    RETURN; -- empty set for unknown or invalid tokens
  END IF;

  RETURN QUERY
  SELECT * FROM lessons WHERE instructor_id = v_instructor_id;
END;
$$;

-- Allow the anon role to call this function.
-- Do NOT grant SELECT on lessons to anon — all lesson reads go through this function.
GRANT EXECUTE ON FUNCTION get_instructor_lessons(uuid) TO anon;
```

---

#### 2. Apply the migration to the hosted Supabase project

**File**: `supabase/migrations/20260627000001_add_access_policies.sql` (via CLI)

**Intent**: Push the migration to the hosted project so the function and policies exist
in the live database before the tests run.

**Contract**: Run `npx supabase db push` from the project root. Requires the Supabase
CLI to be authenticated and the project to be linked (`npx supabase link --project-ref
<ref>`). If the CLI is not installed, the SQL can be applied via the Supabase dashboard
SQL editor as an alternative.

---

#### 3. Create `src/lib/supabase/rls.test.ts`

**File**: `src/lib/supabase/rls.test.ts` (new file)

**Intent**: Prove Risk #1 at the data layer. Three tests: (1) instructor A's token
returns only A's lessons; (2) instructor B's token returns only B's lessons and not A's;
(3) an unknown token returns an empty set with no data leakage. The anon client is used
for assertions to exercise the same code path as the deployed application.

**Contract**: The test file structure:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestServiceRoleClient,
  createTestAnonClient,
  seedInstructor,
  seedStudent,
  seedLesson,
  cleanupRows,
} from './test-client'

describe('Risk #1 — Instructor token IDOR protection (data layer)', () => {
  const db = createTestServiceRoleClient()
  const anon = createTestAnonClient()

  let instructorA: { id: string; token: string }
  let instructorB: { id: string; token: string }
  let student: { id: string }
  let lessonA: { id: string }
  let lessonB: { id: string }
  const cleanup: { table: string; id: string }[] = []

  beforeAll(async () => {
    student = await seedStudent(db)
    instructorA = await seedInstructor(db)
    instructorB = await seedInstructor(db)
    lessonA = await seedLesson(db, instructorA.id, student.id)
    lessonB = await seedLesson(db, instructorB.id, student.id)
    cleanup.push(
      { table: 'lessons', id: lessonA.id },
      { table: 'lessons', id: lessonB.id },
      { table: 'instructors', id: instructorA.id },
      { table: 'instructors', id: instructorB.id },
      { table: 'students', id: student.id },
    )
  })

  afterAll(async () => {
    await cleanupRows(db, cleanup)
  })

  it('instructor A token returns only A lessons — not B lessons', async () => {
    const { data, error } = await anon.rpc('get_instructor_lessons', {
      p_token: instructorA.token,
    })
    expect(error).toBeNull()
    const ids = (data ?? []).map((row: { id: string }) => row.id)
    expect(ids).toContain(lessonA.id)
    expect(ids).not.toContain(lessonB.id) // IDOR: must NOT appear
  })

  it('instructor B token returns only B lessons — not A lessons', async () => {
    const { data, error } = await anon.rpc('get_instructor_lessons', {
      p_token: instructorB.token,
    })
    expect(error).toBeNull()
    const ids = (data ?? []).map((row: { id: string }) => row.id)
    expect(ids).toContain(lessonB.id)
    expect(ids).not.toContain(lessonA.id) // IDOR: must NOT appear
  })

  it('unknown token returns empty set — no data leakage', async () => {
    const { data, error } = await anon.rpc('get_instructor_lessons', {
      p_token: '00000000-0000-0000-0000-000000000000',
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})
```

The oracle for the assertion is the fixture IDs from `beforeAll` — not the API response
itself. This avoids the anti-pattern flagged in the test plan (taking expected values
from the system under test).

---

### Success Criteria

#### Automated Verification

- Migration applies without error: `npx supabase db push` exits with code 0.
- `npm run test` → all three data-layer tests in `rls.test.ts` pass.
- `npm run lint` passes — no ESLint violations in the new files.

#### Manual Verification

- Verify in the Supabase dashboard (Table Editor → Functions or SQL Editor) that
  `get_instructor_lessons` exists and the three RLS policies appear on the
  `lessons` and `instructors` tables.
- Run `npm run test` with `console.log(data)` in one test temporarily to confirm the
  lesson rows returned match the seeded IDs, not the full table.

**Implementation Note**: If `npx supabase db push` fails because the CLI is not linked,
apply the migration via the Supabase dashboard SQL editor. The tests cannot pass until
the function exists in the hosted project.

---

## Phase 3: Stub Source Files and Pending HTTP Tests

### Overview

Create empty stub source files at the locations F-02 and S-02 will populate, and
co-locate pending test files alongside them per the AGENTS.md co-location rule. These
tests document the HTTP-layer acceptance criteria and will pass when the stubs are
replaced with real implementations.

### Changes Required

#### 1. Create `src/middleware.ts` (stub)

**File**: `src/middleware.ts` (project root level, new file)

**Intent**: Reserve the file location that F-02 will implement. An empty stub lets the
co-located test file compile and the `middleware.test.ts` import path resolve correctly.

**Contract**: A minimal stub that compiles without error. Add a comment directing F-02's
implementer to the acceptance criteria:

```typescript
// TODO (F-02): implement auth middleware.
// Acceptance criteria: src/middleware.test.ts
export {}
```

Do not add a `matcher` export yet — the test file will document the expected shape.

---

#### 2. Create `src/middleware.test.ts`

**File**: `src/middleware.test.ts` (new file, co-located with `src/middleware.ts`)

**Intent**: Document Risk #6's acceptance criteria as `.todo()` tests. When F-02
implements the middleware and `/login` route, these tests are enabled (remove `.todo()`)
and must pass. The `fetch` calls target a running dev server — this test requires
`vitest.config.ts` to be extended with a `webServer` preset when activated.

**Contract**:

```typescript
import { describe, it } from 'vitest'

// These tests require F-02 middleware to be implemented.
// When F-02 ships: remove .todo(), add webServer to vitest.config.ts,
// and set BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'.

describe('Risk #6 — Unauthenticated office route access (middleware)', () => {
  it.todo(
    'unauthenticated GET /office → 302 redirect with Location: /login?next=/office',
  )
  // When enabled, assertion shape:
  //   const res = await fetch(`${BASE_URL}/office`, { redirect: 'manual' })
  //   expect(res.status).toBe(302)
  //   expect(res.headers.get('location')).toMatch(/\/login\?next=%2Foffice/)

  it.todo(
    'unauthenticated GET /office/lessons → 302 redirect with Location: /login?next=/office/lessons',
  )

  it.todo(
    'unauthenticated GET /office/calendar → 302 redirect with Location: /login?next=/office/calendar',
  )

  it.todo('authenticated GET /office → 200 (session cookie present)')
  // When enabled: send a valid Supabase Auth session cookie and assert 200.
})
```

The `next` query param value is URL-encoded in the Location header (`%2Foffice` not
`/office`) — the assertion regex must account for this.

---

#### 3. Create `src/app/instructor/[token]/page.tsx` (stub)

**File**: `src/app/instructor/[token]/page.tsx` (new file)

**Intent**: Reserve the dynamic route location that F-02 (token validation) and S-02
(lesson display and actions) will implement. Allows the co-located test to resolve.

**Contract**:

```typescript
// TODO (F-02 + S-02): implement instructor page.
// Acceptance criteria: src/app/instructor/[token]/page.test.ts
export default function InstructorPage() {
  return null
}
```

---

#### 4. Create `src/app/instructor/[token]/page.test.ts`

**File**: `src/app/instructor/[token]/page.test.ts` (new file, co-located)

**Intent**: Document the HTTP-layer acceptance criteria for Risk #1 (cross-token IDOR
via the route). When F-02 implements token validation and S-02 implements the lesson
handler, these tests are enabled and must pass.

**Contract**:

```typescript
import { describe, it } from 'vitest'

// These tests require F-02 (middleware + token validation) and S-02 (lesson handler).
// When those ship: remove .todo(), configure webServer in vitest.config.ts.

describe('Risk #1 — Instructor token IDOR protection (HTTP layer)', () => {
  it.todo('GET /instructor/<tokenA> returns only instructor A lessons in the response')
  // Assertion shape when enabled:
  //   const res = await fetch(`${BASE_URL}/instructor/${instructorA.token}`)
  //   const html = await res.text()  // or JSON if the route returns JSON
  //   expect(html).toContain(lessonA.id)
  //   expect(html).not.toContain(lessonB.id)

  it.todo('GET /instructor/<invalid-uuid> returns 404')
  // Assertion shape when enabled:
  //   const res = await fetch(`${BASE_URL}/instructor/00000000-0000-0000-0000-000000000000`)
  //   expect(res.status).toBe(404)

  it.todo(
    'GET /instructor/<tokenA> does not expose instructor B lesson IDs anywhere in the response',
  )
  // This is the canonical IDOR test: seed two instructors with lessons,
  // request with tokenA, assert lessonB.id is absent from the full response body.
})
```

---

### Success Criteria

#### Automated Verification

- `npm run test` → Phase 2 data-layer tests still pass; Phase 3 `.todo()` tests are
  reported as "todo" (not as failures) — exit code remains 0.
- `npm run build` passes — stub `.tsx` exports a default function component; no
  TypeScript errors in `.test.ts` files (`.todo()` tests require no imports to compile).
- `npm run lint` passes.

#### Manual Verification

- Review `src/middleware.test.ts` and `src/app/instructor/[token]/page.test.ts`:
  confirm the assertion comments match the Risk Response Guidance in
  `context/foundation/test-plan.md` §2 (rows #1 and #6).
- Verify that `src/middleware.ts` and `src/app/instructor/[token]/page.tsx` both appear
  in `git status` as new files (not tracked previously).

---

## Phase 4: §6.1 Cookbook Update

### Overview

Fill in the `§6.1 Adding a unit or integration test` section of the test plan with the
actual patterns established in Phases 1–3. This entry is what future contributors (and
`/10x-tdd` in Lesson 2) read when they need to add a test.

### Changes Required

#### 1. Update `context/foundation/test-plan.md` §6.1

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD` placeholder in §6.1 with the canonical integration test
pattern, file location convention, environment variable requirements, and run commands.

**Contract**: Replace the existing §6.1 body (currently `TBD — see §3 Phase 1 ...`)
with the following content (exact wording at author's discretion, but covering all four
points):

1. **Test type**: Vitest, `environment: 'node'`. For server-side integration tests
   (server actions, RLS functions, data layer). Browser tests are not configured yet.
2. **File location**: co-locate as `<source-file>.test.ts` beside the source file per
   AGENTS.md. Exception: cross-cutting data-layer tests live at
   `src/lib/supabase/rls.test.ts`.
3. **Fixture pattern**: `beforeAll` seeds via `createTestServiceRoleClient()` from
   `src/lib/supabase/test-client.ts`; `afterAll` calls `cleanupRows` in reverse insert
   order. Use `createTestAnonClient()` for assertion calls.
4. **Run command**: `npm run test` (single run); `npm run test:watch` (watch mode).
5. **Reference test**: `src/lib/supabase/rls.test.ts` — canonical example of a
   data-layer integration test with seed/teardown.

Also update the "Last updated" date in the test-plan.md header comment.

---

### Success Criteria

#### Manual Verification

- §6.1 contains all four points above (test type, file location, fixture pattern, run
  command, reference test).
- The `TBD` placeholder is replaced — no remaining `TBD` in §6.1.
- A future contributor reading §6.1 can add a new integration test without reading this
  plan document.

---

## Testing Strategy

### Integration Tests (data layer — run now)

`src/lib/supabase/rls.test.ts` — three tests proving Risk #1 at the database function
level. These run against the live hosted Supabase project using real data.

### Pending Tests (HTTP layer — activated when F-02/S-02 ship)

`src/middleware.test.ts` — four `.todo()` tests for Risk #6 (unauthenticated office
access). Require a running Next.js server and authenticated session fixture.

`src/app/instructor/[token]/page.test.ts` — three `.todo()` tests for Risk #1
(HTTP-layer IDOR). Require a running Next.js server and two seeded instructor fixtures.

Enabling a pending test requires:
1. Remove `.todo()` from the test.
2. Add `webServer` config to `vitest.config.ts` (start `npm run dev` before the test
   suite runs, or use `@vitest/browser` + Playwright).
3. Add `TEST_BASE_URL` to `.env.test`.

### Manual Testing

- After Phase 2: open the Supabase dashboard and confirm the `get_instructor_lessons`
  function exists. Run it with a known seed instructor token via the SQL editor and
  verify it returns only that instructor's lessons.
- After Phase 3: run `npm run build` and confirm no TypeScript errors in the stub files.

---

## References

- Test plan (strategy and phase table): `context/foundation/test-plan.md`
- Research for this change: `context/changes/testing-auth-access-boundaries/research.md`
- Supabase client utilities: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`
- Schema migration (token column, FK structure, RLS enable): `supabase/migrations/20260614143835_initial_schema.sql`
- Seed data: `supabase/seed.sql`
- Prior change — data foundation plan: `context/changes/supabase-data-foundation/plan.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step
> lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Bootstrap and Shared Test Utilities

#### Automated

- [x] 1.1 `npm run test` exits with code 0 (runner starts, no config errors) — cecc02d
- [x] 1.2 `npm run build` passes — no TypeScript errors introduced — cecc02d

#### Manual

- [x] 1.3 `.env.test` is listed in `.gitignore` and does not appear in `git status` — cecc02d
- [x] 1.4 `node_modules/vitest` exists after install — cecc02d

### Phase 2: RLS Migration, SECURITY DEFINER Function, and Data-Layer Tests

#### Automated

- [x] 2.1 `npx supabase db push` exits with code 0 (migration applies cleanly) — bb6d7a1
- [x] 2.2 `npm run test` → all three `rls.test.ts` tests pass — bb6d7a1
- [x] 2.3 `npm run lint` passes — bb6d7a1

#### Manual

- [x] 2.4 `get_instructor_lessons` function visible in Supabase dashboard — bb6d7a1
- [x] 2.5 Three RLS policies visible on `lessons`, `instructors`, `students` tables — bb6d7a1
- [x] 2.6 Manual SQL editor call with a seed instructor token returns only that
          instructor's lessons — bb6d7a1

### Phase 3: Stub Source Files and Pending HTTP Tests

#### Automated

- [x] 3.1 `npm run test` — Phase 2 tests still pass; `.todo()` tests report as "todo",
          not as failures; exit code 0 — 7b39c17
- [x] 3.2 `npm run build` passes — stub files compile without TypeScript errors — 7b39c17
- [x] 3.3 `npm run lint` passes — 7b39c17

#### Manual

- [x] 3.4 Pending test assertions in `middleware.test.ts` and `page.test.ts` match the
          Risk Response Guidance in `test-plan.md` §2 rows #1 and #6 — 7b39c17
- [x] 3.5 Both stub source files appear in `git status` as new tracked files — 7b39c17

### Phase 4: §6.1 Cookbook Update

#### Manual

- [x] 4.1 §6.1 of `test-plan.md` covers all four points (test type, file location,
          fixture pattern, run command, reference test) — 7eb618d
- [x] 4.2 No remaining `TBD` placeholder in §6.1 — 7eb618d
