---
date: 2026-06-27T00:00:00+02:00
researcher: aleksandergorecki80
git_commit: 50c1ebec2cbb60ccc56fe78be6c2a9d9e1b5af4d
branch: main
repository: driving-school-planner
topic: "Auth & access boundary grounding — Risks #1 (instructor IDOR) and #6 (unauthenticated office access)"
tags: [research, auth, idor, middleware, supabase, rls, instructor-token, office-routes]
status: complete
last_updated: 2026-06-27
last_updated_by: aleksandergorecki80
---

# Research: Auth & Access Boundary Grounding (Phase 1)

**Date**: 2026-06-27  
**Researcher**: aleksandergorecki80  
**Git Commit**: 50c1ebec2cbb60ccc56fe78be6c2a9d9e1b5af4d  
**Branch**: main  
**Repository**: driving-school-planner

---

## Research Question

Ground Phase 1 of the test plan (auth & access boundaries), covering Risks #1 and #6:

- **Risk #1 (IDOR)**: How does the instructor URL token resolve to an instructor record? How are lessons scoped to that instructor? Is the token a join key or a two-step lookup? Can a different valid token access another instructor's lessons?
- **Risk #6 (unauthenticated office access)**: What is the office route structure? What path patterns does the middleware cover? What is the redirect target for unauthenticated requests?

---

## Summary

**The single most important finding**: neither the instructor token routes nor the office routes have been built yet. F-02 (auth-scaffold, status: proposed) is the roadmap item that will create both. What *does* exist is the database foundation (F-01 complete) — the schema, Supabase client utilities, and seed data — plus the full intended design documented across the PRD, roadmap, and prior change plans.

This means Phase 1 is writing **tests as contracts** for code not yet written. The research grounds the intended architecture precisely enough for the plan to specify:
1. What test infrastructure to bootstrap (Vitest is not installed).
2. What integration tests to write as acceptance criteria for F-02 and S-02.
3. Which open design questions F-02's plan must answer before tests can run.

The IDOR risk (Risk #1) is structurally real: the intended design uses a two-step lookup (token → instructor_id → lessons filtered by instructor_id). If F-02 validates the token in step 1 but the lesson query in step 2 is not enforced against the resolved instructor_id, a cross-token data access is possible with no error. The middleware risk (Risk #6) is structurally real: the office route prefix is not defined anywhere, so the middleware matcher pattern cannot yet be audited for uncovered prefixes.

---

## Detailed Findings

### F1 — Database schema and token infrastructure (exists)

The data foundation is complete. Key facts:

- **Instructor token column**: `instructors.token` — type `uuid`, NOT NULL, UNIQUE, `DEFAULT gen_random_uuid()`. Auto-populated on INSERT (seed data omits the column; PostgreSQL fills it). This is not the primary key; `instructors.id` (also uuid) is the PK.
  - [`supabase/migrations/20260614143835_initial_schema.sql`, line 9](https://github.com/aleksandergorecki80/driving-school-planner/blob/50c1ebec2cbb60ccc56fe78be6c2a9d9e1b5af4d/supabase/migrations/20260614143835_initial_schema.sql#L9)

- **Lessons table**: `lessons.instructor_id` is a FK to `instructors.id` (NOT the token). Cross-instructor scoping must filter on `instructor_id`, not on the token column.
  - [`supabase/migrations/20260614143835_initial_schema.sql`, lines 15–31](https://github.com/aleksandergorecki80/driving-school-planner/blob/50c1ebec2cbb60ccc56fe78be6c2a9d9e1b5af4d/supabase/migrations/20260614143835_initial_schema.sql#L15)

- **RLS enabled, no policies**: All three tables (`instructors`, `students`, `lessons`) have `ENABLE ROW LEVEL SECURITY`. Zero `CREATE POLICY` statements exist in any migration. Default-deny posture: anon-key reads return no rows.
  - [`supabase/migrations/20260614143835_initial_schema.sql`, lines 34–37](https://github.com/aleksandergorecki80/driving-school-planner/blob/50c1ebec2cbb60ccc56fe78be6c2a9d9e1b5af4d/supabase/migrations/20260614143835_initial_schema.sql#L34)
  - Prior change note: "F-02 adds authenticated and token-based access policies." — `context/changes/supabase-data-foundation/plan.md`, Phase 2, line 188.

- **Seed data**: Five instructors with auto-generated tokens.
  - [`supabase/seed.sql`, lines 1–6](https://github.com/aleksandergorecki80/driving-school-planner/blob/50c1ebec2cbb60ccc56fe78be6c2a9d9e1b5af4d/supabase/seed.sql#L1)

---

### F2 — Supabase client setup (exists)

Both server and client utilities are present and use the anon key.

- **Server client** (`createServerClient` from `@supabase/ssr`): reads and writes session cookies via Next.js `cookies()` (async, correctly awaited — critical because Next.js 15+ made `cookies()` async). Uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - [`src/lib/supabase/server.ts`, lines 1–27](https://github.com/aleksandergorecki80/driving-school-planner/blob/50c1ebec2cbb60ccc56fe78be6c2a9d9e1b5af4d/src/lib/supabase/server.ts#L1)

- **Browser client** (`createBrowserClient` from `@supabase/ssr`): marked `'use client'`. Same anon key.
  - [`src/lib/supabase/client.ts`, lines 1–10](https://github.com/aleksandergorecki80/driving-school-planner/blob/50c1ebec2cbb60ccc56fe78be6c2a9d9e1b5af4d/src/lib/supabase/client.ts#L1)

- **Service role key**: defined in `.env.example` (`SUPABASE_SERVICE_ROLE_KEY`) but **not used anywhere in current code**. It bypasses RLS and is the correct client to use for test setup (seeding fixtures, independent DB reads as oracle).

---

### F3 — Instructor token auth flow (intended, not yet implemented)

Sources: PRD §FR-006, roadmap F-02, shape-notes.md, prior change plan.

**Intended architecture** (what F-02 must build):

```
URL: /instructor/[token]  (or /instructor?token=<uuid> — pattern not yet specified)
   │
   ▼ middleware.ts
SELECT id FROM instructors WHERE token = <url_token>
   → unknown token: reject (401 or 404, response code not specified)
   → known token: proceed, attach resolved instructor_id to request context
   │
   ▼ route handler / server action
SELECT * FROM lessons WHERE instructor_id = <resolved_instructor_id>
```

The critical structural property: the token resolves to `instructor_id` first; lessons are then filtered by `instructor_id`. The token is NOT used as a direct join key into `lessons`. If any query reads lessons without re-applying the `instructor_id` filter (e.g., `SELECT * FROM lessons WHERE id = ?` with the lesson id coming from the URL), IDOR is possible.

**What exists in code**: none. No `middleware.ts`, no instructor page or route, no server actions for approve/reject. The `.next/server/middleware-manifest.json` confirms `"middleware": {}`.

**Why instructors do NOT use Supabase Auth** (deliberate decision): PRD §FR-006: "Socratic: Counter-argument considered: 'token with no expiry is a security risk if the link leaks.' Resolution: kept as-is. This is an internal tool for a small school; token revocation and TTL are a later concern. Risk is accepted."

---

### F4 — Office route structure and middleware (intended, not yet implemented)

Sources: roadmap F-02, PRD §Access Control.

**Intended architecture** (what F-02 must build):

- Login page at `/login` — issues Supabase Auth session cookie on successful email + password
- `middleware.ts` at project root — rejects unauthenticated requests to all office routes
- Unauthenticated request → redirect to `/login`
- Authenticated office request → passes through to the route

**What is NOT specified** anywhere in the current documents:
- The exact office route prefix (is it `/office/*`? `/dashboard/*`? An unnamed route group?)
- The middleware matcher pattern (exact string or regex)
- Whether API routes, if any, are covered by the same matcher

**What exists in code**: only `src/app/page.tsx` (boilerplate), `src/app/layout.tsx`, globals.css, favicon. No middleware, no `/login` route, no office or instructor route folders.

---

### F5 — IDOR exposure: cross-token data access (current state)

Current state: **not exercisable** — not because it is protected, but because there are no routes to exercise. There is no instructor endpoint to send a cross-token request to.

**When the vulnerability window opens**: F-02 builds the instructor page and middleware, S-02 builds the lesson query and approve/reject server actions. If those implementations do the token lookup but fail to enforce `instructor_id` scoping on every subsequent query, cross-token access becomes possible.

**Structural risk factors to watch in F-02/S-02 implementation review**:
1. Any lesson query that takes a lesson `id` from the URL and does `SELECT * FROM lessons WHERE id = ?` without also `AND instructor_id = <resolved_id>`.
2. Any server action that takes instructor_id from the client (request body) rather than re-resolving it from the token.
3. Any approve/reject action that fetches the lesson first and only then checks ownership — if the fetch succeeds before the check, the lesson data has already been accessed.

---

### F6 — Access control model (three roles)

Source: PRD §Access Control, shape-notes.md, roadmap F-02.

| Role | Auth mechanism | Scope | Status |
|------|---------------|-------|--------|
| Office staff | Supabase Auth email+password → session cookie | Full CRUD on lessons, all instructors/students | F-02 (proposed) |
| Instructor | URL token (UUID in `instructors.token`) | Read own lessons, approve/reject own lessons | F-02 + S-02 (proposed) |
| Unauthenticated | None | Rejected — redirect to /login or token validation failure | F-02 (proposed) |

**No student-facing portal** exists or is planned in MVP. Students receive information via phone.

---

## Code References

| File | What's there |
|------|-------------|
| `supabase/migrations/20260614143835_initial_schema.sql:9` | `token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE` — the instructor token column |
| `supabase/migrations/20260614143835_initial_schema.sql:15–31` | `lessons` table with `instructor_id` FK to `instructors.id` |
| `supabase/migrations/20260614143835_initial_schema.sql:34–37` | `ENABLE ROW LEVEL SECURITY` on all three tables; zero CREATE POLICY statements |
| `supabase/seed.sql:1–6` | Five instructors with auto-generated tokens |
| `src/lib/supabase/server.ts:1–27` | Async server client, cookie session management |
| `src/lib/supabase/client.ts:1–10` | Browser client factory |
| `.env.example` | All four required env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) |
| `context/foundation/prd.md:104–112` | Access Control section |
| `context/foundation/roadmap.md:65–77` | F-02 specification — auth-scaffold |
| `context/foundation/roadmap.md:72–76` | F-02 risk note: two access models in one middleware increase misconfiguration surface |
| `context/foundation/roadmap.md:97–109` | S-02 specification — instructor-responds |
| `context/changes/supabase-data-foundation/plan.md:188` | Deliberate decision: no RLS policies in F-01; F-02 will add them |

---

## Architecture Insights

### Two-step token resolution is structurally required

The token column (`instructors.token`) is NOT a FK into `lessons`. Lessons reference `instructors.id` (the PK). Any correct implementation must do two distinct steps:
1. Resolve token → `instructor_id`: `SELECT id FROM instructors WHERE token = $token`
2. Scope lesson query by `instructor_id`: `WHERE instructor_id = $resolvedId`

An implementation that uses the token as a passthrough (e.g., JOINing `lessons JOIN instructors ON lessons.instructor_id = instructors.id WHERE instructors.token = $token`) is also correct, but an implementation that accepts `instructor_id` from the client body and does not re-resolve it from the token is IDOR-vulnerable.

### RLS + application layer = defense in depth (not yet wired)

The intended design relies primarily on the application layer for scoping. RLS policies (to be added in F-02) will provide a second defense layer: even if a server action forgets a WHERE clause, the DB will deny the read. Without RLS policies, a missing WHERE clause silently returns all rows (or default-deny with no policies, which is also wrong in production). The plan must specify whether Phase 1 tests will exercise the application-layer gate, the RLS gate, or both.

### Office route prefix must be decided in F-02's plan

This is the single most concrete gap for Risk #6 testing. Until F-02 specifies the route prefix and middleware matcher pattern, the integration test for unauthenticated office access cannot enumerate which URLs to test. The test plan explicitly warns: "a path matcher scoped to one prefix will silently pass other office prefixes."

### Vitest is not installed

`package.json` lists no test runner. Phase 1 must bootstrap Vitest as its first step before any test can run. The test plan (§4 Stack) specifies Vitest with co-located `*.test.ts` files.

---

## Historical Context (from prior changes)

- `context/changes/supabase-data-foundation/plan.md` — Phase 2 line 188: "No RLS policies in this migration — the service role key used by all server-side code bypasses RLS automatically. F-02 adds authenticated and token-based access policies." This confirms the deliberate deferral of RLS policy writing to F-02. It also implies that current server-side code was written to use the service role key, but inspecting `server.ts` shows only the anon key is used — this may be an inconsistency introduced during implementation, or the service role key was planned but not needed yet.

- `context/changes/supabase-data-foundation/plan.md` — "Critical Implementation Details" (async cookies): `cookies()` is async in Next.js 15+. `server.ts` correctly awaits it. Any middleware written in F-02 must do the same; a synchronous `cookies()` call silently returns a Promise object and auth reads fail without an error.

- `context/foundation/infrastructure.md` — Risk: connection pool exhaustion if Supabase connection string uses session-mode URL (port 5432) instead of transaction-mode (port 6543). Not relevant to auth boundary testing, but relevant to test environment setup.

---

## Related Research

No prior research artifacts exist under `context/changes/` or `context/archive/` for auth topics. This is the first research on auth for this project.

---

## Open Questions

The following questions must be resolved — either by the `/10x-plan` for this change or by F-02's plan — before the integration tests can run:

| # | Question | Blocks |
|---|----------|--------|
| OQ-1 | What is the office route prefix? (`/office/*`, `/dashboard/*`, or a route group?) | Risk #6 middleware test: which URLs to enumerate |
| OQ-2 | What is the instructor URL pattern? (dynamic path `/instructor/[token]` vs query param `/instructor?token=xxx`) | Risk #1 test: how to construct cross-token URLs |
| OQ-3 | What response does an invalid/unknown token return? (401, 404, or redirect?) | Risk #1 test: what to assert on cross-token access attempt |
| OQ-4 | What response does an unauthenticated office request return? (302 to `/login`, 401, or 403?) | Risk #6 test: what to assert |
| OQ-5 | Will F-02 add RLS policies? If yes, does Phase 1 test the RLS gate, the application gate, or both? | Risk #1 test: which layer to exercise |
| OQ-6 | What Supabase client (anon or service role) will the integration tests use for setup? | All tests: test isolation and seed strategy |
| OQ-7 | Will there be a shared hosted test project, or should tests spin up a local Supabase instance? | Test environment config |

OQ-1 through OQ-4 are **design decisions** that belong in F-02's plan. The Phase 1 plan can propose answers (e.g., recommend `/office/*` as the prefix) and write the tests against those proposals. OQ-5 through OQ-7 are **test infrastructure decisions** that the Phase 1 plan must make.

---

## Phase 1 Plan Constraints (derived from this research)

These are hard constraints the `/10x-plan` must respect:

1. **Bootstrap Vitest first** — no test runner exists; Phase 1 plan must include install + configuration as step 0. Per test-plan.md §4 Stack: Vitest, `*.test.ts` co-located.

2. **Tests are contracts for unbuilt code** — the instructor route and middleware do not exist. Tests must be written in a way that will compile and fail (not error) before F-02 lands, and pass after it lands. This likely means testing server action functions or route handler functions directly rather than via HTTP.

3. **Service role client for test fixtures** — the anon key hits RLS default-deny. Tests need a service role client to seed two instructors + two lesson sets, and to read back DB state as an independent oracle (avoiding the "oracle taken from the API response" anti-pattern flagged in the test plan).

4. **Two-instructor, two-lesson-set fixture** — the canonical fixture for Risk #1: instructor A with token_A owns lesson set A; instructor B with token_B owns lesson set B. The cross-token test: access lesson set A using token_B and expect rejection.

5. **Enumerate each office route prefix individually** for Risk #6 — do not test only one prefix and assume the others are covered. Each distinct prefix gets its own unauthenticated request assertion.
