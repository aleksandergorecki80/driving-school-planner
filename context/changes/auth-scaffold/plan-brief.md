# Auth Scaffold (F-02) — Plan Brief

> Full plan: `context/changes/auth-scaffold/plan.md`

## What & Why

Wire the two access models described in the PRD: an email+password Supabase Auth session for the office role, and a UUID URL token for the instructor role (no login). F-02 is a foundation layer — S-01 and S-02 cannot be built without it because all office routes require a session and the instructor page requires a valid token.

## Starting Point

F-01 is complete: Supabase packages are installed, server/client utilities exist, the schema (including the `get_instructor_lessons` SECURITY DEFINER RPC) and all RLS policies are deployed. The middleware is a passthrough stub and the instructor page returns `null`.

## Desired End State

The office can log in at `/login`, land on `/office`, and log out via the header button. Any unauthenticated request to `/office/*` is redirected to `/login?next=<path>` and returns there after login. An instructor's unique URL (`/instructor/<token>`) shows their name heading or 404 on an unknown token — no login required. All 4 middleware integration tests pass.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Instructor token validation location | Page (Server Component) | Keeps middleware fast — the RPC already handles the empty-set case | Plan |
| Login error display | `useActionState` inline | Clean React 19 pattern; avoids URL-visible error state | Plan |
| Instructor page F-02 content | Instructor name heading | Proves the auth path end-to-end without duplicating S-02 scope | Plan |
| Logout scope | In F-02 | Auth scaffold is complete without dev-only workarounds | Plan |
| Post-login redirect | Honor `?next=`, fallback `/office` | Completes the middleware `?next=` round-trip the test file expects | Plan |
| Instructor name query | Service role client | `instructors` table has no anon SELECT policy; avoids a new migration | Plan |
| Office account setup | Include in plan (not pre-existing) | Plan is self-contained; Supabase Auth user created via dashboard | Plan |

## Scope

**In scope:**
- `/login` page (Server Component + `useActionState` Client Component form)
- `loginAction` and `logoutAction` server actions
- `src/middleware.ts` — `updateSession` pattern protecting `/office/*`
- `src/lib/supabase/service.ts` — service role client factory
- `src/app/office/layout.tsx` (logout button) + `src/app/office/page.tsx` (placeholder)
- `src/app/instructor/[token]/page.tsx` — token validation + name heading
- Enable 4 middleware integration tests in `src/middleware.test.ts` + `vitest.config.ts` `webServer` config

**Out of scope:**
- RLS policies (already deployed in F-01 migrations)
- Email verification, password reset, session revocation
- Instructor lesson list (S-02)
- Office booking UI (S-01)
- `src/app/instructor/[token]/page.test.ts` test enablement (depends on S-02)

## Architecture / Approach

Two distinct auth paths in one middleware file: office requests to `/office/*` are checked against the Supabase Auth session (JWT validation, no DB call for non-expired tokens); instructor requests to `/instructor/*` bypass middleware and validate in the page component via a service role DB lookup. Login/logout are Server Actions; the login form uses `useActionState` to display errors inline without a client router.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Auth Account + Server Actions | Office Auth user + `loginAction`/`logoutAction` | Missing env vars in `.env.test` break Phase 4 tests |
| 2. Login Page | `/login` route renders; sign-in flow works end-to-end | `useActionState` `isPending` state must not block the form on server errors |
| 3. Protected Page Shells | Office layout/placeholder + instructor page with token validation | `.maybeSingle()` must handle both unknown tokens and invalid UUID strings gracefully |
| 4. Middleware | Office routes protected; redirect loop impossible; 4 integration tests green | Returning a plain `NextResponse.next()` instead of `supabaseResponse` silently breaks session refresh |

**Prerequisites:** F-01 complete (Supabase client, schema, RLS policies, `get_instructor_lessons` RPC all deployed); `.env.local` populated with real Supabase credentials.

**Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- Supabase Auth office user must be created manually before Phase 1 automated tests can be verified end-to-end.
- The authenticated middleware test (test 4) requires Supabase Auth sign-in from within Vitest — if the anon client's `signInWithPassword` is blocked by RLS or rate-limiting in the test environment, that test may need a different setup approach.
- `vitest.config.ts` `webServer` starts `npm run dev` — this adds ~5–10 s to the test suite cold-start; acceptable for a small project.

## Success Criteria (Summary)

- `npm test` exits 0 with all 4 middleware tests passing and RLS tests still green
- The complete login → office → logout → login round-trip works in the browser
- `/instructor/<unknown-token>` returns a 404 and `/instructor/<valid-token>` shows the instructor's name
