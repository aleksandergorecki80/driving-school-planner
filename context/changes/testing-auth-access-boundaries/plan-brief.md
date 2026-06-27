# Auth & Access Boundaries Integration Tests — Plan Brief

> Full plan: `context/changes/testing-auth-access-boundaries/plan.md`
> Research: `context/changes/testing-auth-access-boundaries/research.md`

## What & Why

Bootstrap Vitest and prove the two Phase 1 auth access boundaries from the quality
contract: instructor token scoping (Risk #1 — IDOR) and unauthenticated office route
blocking (Risk #6 — middleware). Neither the office routes nor the instructor route exist
yet (F-02 is "proposed"); this plan delivers runnable data-layer tests now and pending
HTTP contracts that activate when F-02 ships.

## Starting Point

F-01 is complete: database schema, seed data (5 instructors with UUID tokens), Supabase
client utilities, and RLS enabled on all tables with zero policies (default-deny). No
test runner is installed. F-02 is proposed but not started — there is no middleware, no
`/login` route, and no office or instructor routes.

## Desired End State

`npm run test` runs and all non-pending tests pass. Three data-layer integration tests
prove that a SECURITY DEFINER PostgreSQL function (`get_instructor_lessons`) enforces
token-to-instructor-to-lessons scoping: instructor A's token cannot return instructor
B's lessons. Pending HTTP tests in `src/middleware.test.ts` and
`src/app/instructor/[token]/page.test.ts` document the Risk #6 and Risk #1 (HTTP layer)
acceptance criteria, ready to be enabled when F-02 ships. §6.1 of the test plan cookbook
is filled in with the actual Vitest patterns.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-----------------|--------|
| Test execution model | Hybrid: data-layer runs now + pending HTTP contracts | Proves the database scoping immediately without waiting for unbuilt routes | Plan |
| RLS for instructors | SECURITY DEFINER function, not session variable | `set_config` is transaction-local; PostgREST opens a new transaction per request, so the variable evaporates between JS client calls | Plan |
| RLS for office users | `authenticated` role policy (no-op until F-02) | Written now so it activates automatically when F-02 adds Supabase Auth sessions | Plan |
| Instructor URL pattern | `/instructor/[token]` dynamic path segment | Clean URLs; middleware can match via `matcher: ['/instructor/:path*']` | Plan |
| Office route prefix | `/office/*` | Unambiguous single-prefix matcher; constrains F-02's route structure | Plan |
| Invalid token response | 404 Not Found | Avoids revealing that a valid token format was recognized (no enumeration signal) | Plan |
| Redirect shape | `/login?next=/office/...` | Better UX; office staff land back on their intended page after login | Plan |
| Test isolation | Seed + teardown via service role client | Works against the hosted project; no Docker required; matches test-plan §4 "no mocking" | Research / Plan |
| Pending test location | Co-locate with stub source files | Follows AGENTS.md co-location rule; F-02 fills in the stubs without moving test files | Plan |

## Scope

**In scope:**
- Install and configure Vitest (node environment, `@/*` alias, `.env.test`)
- `src/lib/supabase/test-client.ts` — service role + anon client factories, seed/teardown helpers
- Supabase migration: office RLS policies (authenticated role) + `get_instructor_lessons` SECURITY DEFINER function
- `src/lib/supabase/rls.test.ts` — three data-layer IDOR tests (run now)
- `src/middleware.ts` and `src/middleware.test.ts` (stub + pending Risk #6 HTTP tests)
- `src/app/instructor/[token]/page.tsx` and `page.test.ts` (stub + pending Risk #1 HTTP tests)
- `context/foundation/test-plan.md` §6.1 cookbook update

**Out of scope:**
- Supabase Auth or the office login flow (F-02)
- Middleware implementation (F-02)
- Approve/reject server actions (S-02)
- CI pipeline wiring (Phase 4 of the test plan)
- Playwright or e2e tests (Phase 3 of the test plan)
- Local Supabase setup (Docker)

## Architecture / Approach

Two-layer test strategy:

**Layer 1 — Data layer (runs now):** A `SECURITY DEFINER` PostgreSQL function
(`get_instructor_lessons(p_token uuid)`) validates the token, resolves it to an
`instructor_id`, and returns only that instructor's lessons in one atomic transaction.
Tests call this function via the anon Supabase client (same code path as production).
The service role client seeds fixtures and provides the independent oracle.

**Layer 2 — HTTP layer (pending until F-02):** `.todo()` tests in co-located test files
document the exact assertions that F-02's middleware and instructor route must satisfy.
Enabling a pending test requires removing `.todo()` and wiring a `webServer` preset in
`vitest.config.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Vitest Bootstrap | Working `npm run test`; shared test utilities | Wrong Vitest env (`jsdom` vs `node`) breaks server-side imports |
| 2. RLS Migration + Data-Layer Tests | Runnable IDOR proof for Risk #1; office RLS ready for F-02 | Migration fails if Supabase CLI is not linked; `get_instructor_lessons` not callable if GRANT is missing |
| 3. Stub Sources + Pending HTTP Tests | F-02 acceptance criteria co-located and ready | Stub `.tsx` must export a default component or `npm run build` fails |
| 4. §6.1 Cookbook Update | Future contributors can add tests without reading this plan | Cookbook omits the fixture pattern or reference test |

**Prerequisites:** F-01 complete (confirmed); Supabase CLI installed and linked to the
hosted project (needed for Phase 2 migration push); `.env.test` populated with service
role key (needed for Phase 2 tests).

**Estimated effort:** ~1 session across 4 sequential phases.

## Open Risks & Assumptions

- Phase 2 RLS policies for the `authenticated` role are no-ops today. They activate
  when F-02 ships Supabase Auth — no additional migration needed at that point.
- The pending HTTP tests require a `webServer` config in `vitest.config.ts` (starts
  `npm run dev` during test runs). This is left for when the tests are enabled, not
  Phase 1.
- Test isolation is seed+teardown, not transactional rollback. A test crash before
  `afterAll` can leave orphaned rows. Rows use `crypto.randomUUID()` names to avoid
  cross-run conflicts; manual cleanup is straightforward via the Supabase dashboard.
- The `get_instructor_lessons` function covers the "retrieve" case of Risk #1.
  "Approve" and "reject" are covered by S-02's server action implementation and their
  tests are out of scope for Phase 1.

## Success Criteria (Summary)

- `npm run test` exits with code 0; three `rls.test.ts` tests pass; `.todo()` tests
  report as "todo" — not as failures.
- Calling `get_instructor_lessons` with instructor A's token never returns instructor
  B's lesson ID — confirmed by the test assertion and by manual SQL editor inspection.
- §6.1 of `test-plan.md` is filled in so a future contributor can add a new integration
  test by following the pattern alone, without reading this plan.
