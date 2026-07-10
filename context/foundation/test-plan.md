# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-07-04 (§3 rollout status synced — Phase 1 impl_reviewed, Phase 2 booking-integrity in progress)

---

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic diff that already catches the
   regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is produced
   by `/10x-research` during each rollout phase. If the plan and research
   disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`.

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives."

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|-------------------------------|
| 1 | Instructor opens their URL token and sees another instructor's lessons (IDOR) | High | High | Interview Q1 (top stated concern); PRD Access Control (instructor URL token, no session login); roadmap F-02 risk note ("two distinct access models increase surface area for misconfiguration") |
| 2 | Office creates two lessons in the same time slot for the same instructor, or books the same student into two simultaneous lessons (double-booking) | High | Medium | Interview Q1 ("office schedules multiple lessons at the same time for the same instructor"; "office schedules lesson for the same student with multiple instructors"); PRD FR-004; roadmap S-01 |
| 3 | Category-coherence constraint bypassed at the server layer — lesson created with an instructor who does not hold the lesson category | High | Medium | PRD Business Logic ("A lesson can only be created when the selected instructor holds the licence category"); `supabase-data-foundation` plan ("No DB-level category-coherence constraint — application-enforced via UI filtering") |
| 4 | Status poll returns stale/cached data; office sees wrong lesson state and calls the instructor anyway | High | Medium | Interview Q3 (explicit worry: "I never know if it's actually refreshing or just returning cached data"); PRD FR-005 (polling-based refresh); roadmap S-02 (north star — closing the booking loop proves the product bet) |
| 5 | Rejection reason silently not persisted or not displayed to office; office must call the instructor for context anyway | High | Medium | PRD FR-008 + US-01 AC ("A rejected lesson displays the instructor's rejection reason to the office"); Interview Q2 (null-check 500s — pattern of missing nullable-field handling on edge-case submissions) |
| 6 | Unauthenticated request reaches a protected office route via misconfigured middleware | High | Low | PRD Access Control ("Any request without a valid session or valid instructor token is rejected"); roadmap F-02 risk note ("instructor token accidentally granting access to office routes") |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | A request bearing instructor A's token cannot retrieve, approve, or reject instructor B's lessons | "Token is present in the URL" ≠ "token is validated against the instructor whose data is being served" | How token resolves to an instructor record; how lessons are scoped to that instructor; whether the token is a join key or a separate lookup step | integration | Testing only that a valid token resolves (happy-path) without verifying that a *different* valid token cannot access the same data |
| #2 | Calling the lesson-creation server action twice with the same instructor + overlapping time produces a clear error on the second call; same for same-student overlap | "The UI dropdown prevents it" ≠ "the server action prevents it" — a direct API call bypasses the UI | Whether overlap is checked at all; what "same time slot" means in the schema (exact match or any overlap); whether any DB uniqueness constraint exists | integration (call server action twice; expect second to fail) | Testing only the UI dropdown state rather than the write path; assuming an exact-match check covers all overlapping-slot scenarios |
| #3 | A server-side lesson creation call supplying a mismatched instructor/category is rejected, regardless of what the UI submitted | "The dropdown only shows valid instructors" ≠ "the server re-validates the instructor's categories before writing" — the client can submit anything | Where category validation happens in the server action; whether the server re-queries the instructor's categories or trusts the submitted value | integration (call server action with an instructor who lacks the category; expect rejection) | Testing the filtered dropdown (UI behavior) instead of the server write path; asserting current behavior without an independent oracle for what "valid" means |
| #4 | After a lesson status changes in the DB, the poll endpoint returns the updated status on the next request — not a cached snapshot | "The poll fires every 30 seconds" ≠ "each poll returns fresh DB state" — Next.js caches route handlers by default; browser HTTP cache may also intervene | How the poll is implemented (fetch interval, SWR, manual setInterval); whether the route handler opts out of Next.js caching; which Supabase client (server vs browser) the poll uses | integration (write a status change to DB; call the poll endpoint; assert response reflects the change) | Testing only that a fetch fires on a timer (timer test) without asserting the response reflects the latest DB write; oracle problem — expected status taken from the previous poll response rather than from an independent DB read |
| #5 | After an instructor rejects with a reason, the DB record has a non-null `rejection_reason` and the office poll response includes that reason | "The form has a reason field" ≠ "the server persists it" — if the server action treats the reason as optional and the nullable column default wins silently, the field is lost with no error | How the rejection server action writes to DB; whether `rejection_reason` null vs empty-string is handled consistently; what the poll query selects (does it include `rejection_reason`?) | integration (call rejection server action with a reason; query DB directly; assert non-null reason; assert poll response includes it) | Oracle problem — expected reason value taken from the server action's own response body rather than from an independent DB read; testing only the button-click flow without asserting DB persistence |
| #6 | An unauthenticated HTTP request to any office route receives a redirect to `/login` or a 401 — not the protected page | "Middleware is configured" ≠ "all office routes are in scope" — a path matcher scoped to one prefix will silently pass other office prefixes | What the office route structure looks like after F-02; what path patterns the middleware matcher covers; what the redirect target is | integration (send unauthenticated request to each protected route prefix; assert redirect/4xx) | Testing only the login form flow (happy-path auth success) without verifying that each protected route is individually unreachable without a session |

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Auth & access boundaries | Bootstrap test runner; prove instructor token scopes to own data only; prove office routes block unauthenticated requests | #1, #6 | integration | impl_reviewed | context/changes/testing-auth-access-boundaries/ |
| 2 | Booking integrity | Prove double-booking blocked server-side; prove category-coherence enforced at the server action layer | #2, #3 | integration | implemented | context/changes/booking-integrity/ |
| 3 | Status loop correctness | Prove poll returns live DB state on each cycle; prove rejection reason persisted and visible to office | #4, #5 | integration + e2e | not started — polling mechanism itself confirmed unimplemented 2026-07-10, now tracked as `instructor-responds` Phase 8 | context/changes/instructor-responds/ |
| 4 | Quality gates wiring | Lock lint + typecheck + integration + e2e gates in CI; wire post-edit hook locally | cross-cutting | CI gates, post-edit hook | not started | — |

---

## 4. Stack

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | none yet — see §3 Phase 1 | Native ESM + TypeScript support; faster cold start than Jest for App Router projects; co-locate tests as `*.test.ts` per AGENTS.md |
| Supabase test client | `@supabase/supabase-js` (anon) | already in `package.json` | Use directly in integration tests against the hosted project with a test-only env; no mocking of internal modules |
| e2e | Playwright | none yet — see §3 Phase 3 | Official Next.js e2e recommendation; handles server components and cookie-based auth |
| accessibility | none yet | — | Not in scope for MVP |
| AI-native | not included | — | No AI features in scope; no AI-native test layer justified under cost × signal for this project |

**Stack grounding tools (current session):**
- Docs: none — Context7 / framework docs MCP not available in current session; stack recommendations based on `package.json` manifest and AGENTS.md conventions; checked: 2026-06-21
- Search: none — Exa.ai / web search MCP not available in current session; checked: 2026-06-21
- Runtime/browser: none — Playwright MCP not available in current session; Playwright recommended for e2e but not wired yet (see §3 Phase 3); checked: 2026-06-21
- Provider/platform: Vercel plugin present (deployment/env) — not a docs MCP; Supabase accessible via dashboard but no Supabase MCP in current session; checked: 2026-06-21

---

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required | syntactic / type drift — already wired via `npm run build` + `npm run lint` |
| unit + integration | local + CI | required after §3 Phase 1 | auth boundary regressions, booking logic regressions, polling freshness regressions |
| e2e on critical flows | CI on PR | required after §3 Phase 3 | broken end-to-end booking loop (create → approve/reject → poll cycle) |
| post-edit hook | local (agent loop) | recommended after §3 Phase 4 | regressions at edit time, before a full CI run |
| visual diff (deterministic) | — | not included | static pages excluded from scope (see §7) |
| pre-prod smoke | between merge + prod | optional | environment-specific failures (env var missing, Supabase connection URL wrong) |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section fills in once the
relevant rollout phase ships.

### 6.1 Adding a unit or integration test

**Test type**: Vitest with `environment: 'node'`. Use for server-side integration tests —
RLS functions, data-layer helpers, server actions. Browser/DOM tests are not configured
yet (see §4 for when e2e is warranted instead).

**File location**: Co-locate the test file beside the source file as
`<source-file>.test.ts`, per the AGENTS.md co-location rule. Exception: cross-cutting
data-layer tests that span multiple tables or test database policies live at
`src/lib/supabase/rls.test.ts`.

**Fixture pattern** (seed + teardown isolation):

```typescript
import { beforeAll, afterAll } from 'vitest'
import {
  createTestServiceRoleClient,
  createTestAnonClient,
  seedInstructor,
  cleanupRows,
} from '@/lib/supabase/test-client'

const db = createTestServiceRoleClient() // bypasses RLS — setup/teardown/oracle only
const anon = createTestAnonClient()      // exercises the real data-access path

const cleanup: { table: string; id: string }[] = []

beforeAll(async () => {
  const instructor = await seedInstructor(db)
  cleanup.push({ table: 'instructors', id: instructor.id })
  // seed dependents last so they can be deleted first
})

afterAll(async () => {
  await cleanupRows(db, cleanup) // call in reverse insert order: dependents first
})
```

Seed helpers: `seedInstructor`, `seedStudent`, `seedLesson`, `cleanupRows` — all
exported from `src/lib/supabase/test-client.ts`. Use `createTestAnonClient()` for the
assertions so the call goes through the real data-access path (RLS / SECURITY DEFINER).

**Environment variables**: set in `.env.test` (gitignored). Required vars:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Vitest loads them via `loadEnv(mode, cwd, '')` in `vitest.config.ts` — no manual dotenv
call needed in test files.

**Run command**:
- `npm run test` — single run (CI and pre-commit)
- `npm run test:watch` — watch mode during development

**Reference test**: `src/lib/supabase/rls.test.ts` — canonical example showing
seed/teardown isolation, service-role oracle, and anon-client assertions against the
`get_instructor_lessons` SECURITY DEFINER function.

### 6.2 Adding an integration test for a server action

**Test type**: Vitest with `environment: 'node'` — same runner as §6.1, but targeting a
`'use server'` action instead of a data-layer helper directly.

**Auth wiring**: Server actions call `createClient()` (`@/lib/supabase/server`), which reads
the session via `next/headers` `cookies()`. Mock `next/headers` at the top of the test file
with a mutable `sessionCookies` array shared between the mock's `getAll`/`setAll` and a
`createServerClient` instance created in `beforeAll`. Sign in as the office user
(`OFFICE_EMAIL`/`OFFICE_PASSWORD` from `.env.test`) through that `createServerClient` — the
mock captures the resulting session cookies, so every server-action call in the file sees a
real authenticated session.

**Fixture pattern**: Seed with `createTestServiceRoleClient()` (bypasses RLS) in a
`beforeAll` scoped to each `describe` block that needs its own instructor/student
combination (e.g. a specific `categories` value). Track seeded rows in a per-describe
cleanup array and sweep them in `afterAll`. For lesson rows created inside a test, push
their id to a shared `lessonIds` array and clean up in `afterEach` — this isolates each
test's writes without re-seeding instructors/students per test.

**Dual assertion**: Assert twice per behavior — once on the server action's return value
(`{}` or `{ error: '...' }`), and once by querying the DB directly with the service-role
client to confirm the row was (or wasn't) written, and with what field values. Never assert
only on the return value; a server action can return `{}` while silently failing to persist
a field.

**Reference test**: `src/app/actions/lessons.test.ts` — see
`describe('createLesson — category-coherence')` and
`describe('createLesson — student double-booking')` for this pattern applied to two
independent server-side guards.

### 6.3 Adding an e2e test for the booking loop

TBD — see §3 Phase 3 for poll-freshness and rejection-reason end-to-end patterns.

### 6.4 Adding a test for a new API route or server action

- **Test type**: integration (preferred over e2e unless the failure mode requires cookie + handler crossing).
- **Pattern**: TBD — see §3 Phase 1 and Phase 2 for reference tests once they land.
- **When to add e2e instead**: only if the route's failure mode requires the full deployed shape (auth session + server render + poll cycle).

### 6.5 Per-rollout-phase notes

(Filled in by `/10x-implement` as each phase completes.)

---

## 7. What We Deliberately Don't Test

Exclusions agreed during Phase 2 interview (Q5). Respect these unless the
underlying assumption changes.

- **Static UI components (page header, footer, layout chrome)** — low blast radius, rarely changes, no business logic. Re-evaluate if the layout gains interactive state or auth-conditional rendering. (Source: Phase 2 interview Q5.)
- **TypeScript type correctness** — the compiler runs on every `npm run build` and `npm run lint`; a separate test layer adds no signal. Re-evaluate only if the project adopts a runtime type-validation library whose checks diverge from the TypeScript types. (Source: Phase 2 interview Q5.)
- **Seed data SQL** — verified once via direct Supabase dashboard inspection (see `supabase-data-foundation` plan manual verification steps); not a runtime risk. Re-evaluate if the seeder is run programmatically as part of a CI flow. (Source: `supabase-data-foundation` plan notes.)

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-21
- Stack versions last verified: 2026-06-21
- AI-native tool references last verified: 2026-06-21 (none in scope)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
