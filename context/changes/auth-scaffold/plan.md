# Auth Scaffold (F-02) Implementation Plan

## Overview

Wire the office Supabase Auth session, login/logout flows, middleware protection for all `/office/*` routes, and a token-validated instructor page stub. This is the access control layer that gates S-01 (office books lesson) and S-02 (instructor responds).

## Current State Analysis

As of F-01:
- `@supabase/supabase-js` + `@supabase/ssr` installed; `src/lib/supabase/server.ts` (async server client) and `src/lib/supabase/client.ts` (browser client) exist
- `get_instructor_lessons(p_token uuid)` RPC deployed: SECURITY DEFINER, explicit column list, anon-callable — returns empty set for unknown tokens
- RLS policies for `authenticated` role already grant SELECT on all three tables
- `src/middleware.ts` is a passthrough stub (`return NextResponse.next()`)
- `src/app/instructor/[token]/page.tsx` is a stub returning `null`
- No `/login` page, no `/office/*` routes
- `src/middleware.test.ts` has 4 `.todo()` redirect tests
- No Supabase Auth office user created yet

## Desired End State

After this plan is complete:
- `/login` renders a form; correct credentials set a Supabase Auth session cookie and redirect to `/office` (or the `?next=` destination); incorrect credentials show an inline error
- All requests to `/office/*` without a valid session are redirected to `/login?next=<path>`; authenticated requests proceed
- `/instructor/<valid-uuid-token>` renders an instructor name heading; an unknown token returns 404
- `npm run build` and `npm run lint` both exit 0
- All 4 middleware tests in `src/middleware.test.ts` pass (`.todo()` removed, `webServer` configured)

### Key Discoveries:

- `cookies()` is async in Next.js 15+ — `createClient()` in `server.ts` is already `async` and awaits it; auth Server Actions must also `await createClient()`
- `get_instructor_lessons` RPC is available to the anon role and returns an empty set for invalid tokens (IDOR-safe at the data layer)
- The `instructors` table has no anon SELECT policy — fetching instructor name requires a service role client (F-01 deferred creating it to F-02)
- Middleware must return the `supabaseResponse` object (not a plain `NextResponse.next()`) after `updateSession` so that refreshed session cookies propagate to the browser
- `next/navigation`'s `redirect()` throws a special Next.js error — it must not be wrapped in a try/catch; error paths must return before calling `redirect()`
- The `?next=` value must be sanitized: only accept paths starting with `/` and not starting with `//` (blocks protocol-relative open redirects)
- `useActionState` (React 19): returns `[state, dispatch, isPending]`; server action signature is `(prevState: T, formData: FormData) => Promise<T>`
- In Next.js 15+, `params` and `searchParams` in page/layout components are Promises — they must be `await`ed
- `src/lib/supabase/server.ts` uses `!` assertions (from F-01) — F-02 code must use guard blocks per `context/foundation/lessons.md`; do not modify the existing file

## What We're NOT Doing

- No role-based access control beyond the two flat roles (office session, instructor token) — no admin tiers
- No email verification or password reset — single shared account managed via Supabase dashboard
- No real-time session invalidation — `updateSession` handles token refresh on every request
- No test enablement for `src/app/instructor/[token]/page.test.ts` — those tests depend on S-02 (lesson handler)
- No new RLS policies or database migrations — F-01's migrations cover all auth boundaries
- No instructor lesson list — S-02 adds that; F-02 renders only the instructor's name heading

## Implementation Approach

Implement in four phases sequenced so each is independently verifiable before the next begins: server actions first (auth logic exists before any UI), then the login page (verifies sign-in end-to-end), then the protected page shells (verifies instructor and office pages are reachable), then middleware last (all target routes exist when middleware redirects are tested).

## Phase 1: Auth Account + Server Actions

### Overview

Create the Supabase Auth office user account (a one-time manual step in the Supabase dashboard) and write the two server actions that drive all auth transitions: `loginAction` and `logoutAction`.

### Changes Required:

#### 1. Create Supabase Auth office user (manual)

**File**: none (Supabase dashboard operation)

**Intent**: Provision the single shared office account that authenticates via email + password. No in-app user management exists in MVP — this account is created once and persists.

**Contract**: Supabase dashboard → Authentication → Users → Add user. Use email `office@driveplan.local` (or a domain you control) and a strong password. Disable email confirmation: Supabase dashboard → Authentication → Settings → toggle off "Confirm email." Store credentials in `.env.test` as `OFFICE_EMAIL` and `OFFICE_PASSWORD` (needed for the Phase 4 authenticated middleware test).

---

#### 2. Create `src/app/actions/auth.ts`

**File**: `src/app/actions/auth.ts`

**Intent**: Expose `loginAction` and `logoutAction` as Next.js Server Actions — the single source of auth state transitions used by the login form and the office layout's logout button.

**Contract**: `"use server"` directive at the top. Two named exports:

- `loginAction(prevState: string | null, formData: FormData): Promise<string | null>` — reads `email`, `password`, and `next` from `formData`. Calls `(await createClient()).auth.signInWithPassword(...)`. On error, returns the error message string (displayed inline by `useActionState`). On success, sanitizes `next` (accept only strings that start with `/` and do not start with `//`; fall back to `'/office'`), then calls `redirect(safeNext)`. Error path returns before `redirect()` is called — do not wrap `redirect()` in try/catch.

- `logoutAction(): Promise<void>` — calls `(await createClient()).auth.signOut({ scope: 'local' })`, then `redirect('/login')`.

No `!` assertions — `createClient()` from `server.ts` handles the env guard internally.

---

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `src/app/actions/auth.ts` exists

#### Manual Verification:

- Supabase dashboard → Authentication → Users shows the office account row
- Office email/password added to `.env.test` as `OFFICE_EMAIL` / `OFFICE_PASSWORD`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: Login Page

### Overview

Create the `/login` route: a Server Component page that reads and sanitizes the `?next=` search param, and a Client Component form that uses `useActionState` for inline error display.

### Changes Required:

#### 1. Create `src/app/login/page.tsx`

**File**: `src/app/login/page.tsx`

**Intent**: Server Component that owns the `/login` route. Reads `searchParams.next`, sanitizes it, and passes it to `LoginForm`. No interactivity — all auth logic lives in the server action.

**Contract**: `async` default export accepting `{ searchParams: Promise<{ next?: string }> }`. Awaits `searchParams`. Sanitizes `next` using the same rule as `loginAction` (start with `/`, not `//`; fallback `'/office'`). Renders a centered page layout with `<LoginForm next={safeNext} />`.

---

#### 2. Create `src/app/login/LoginForm.tsx`

**File**: `src/app/login/LoginForm.tsx`

**Intent**: Client Component wrapping the login form. Uses `useActionState` to capture the error string returned by `loginAction` and display it inline — no redirect on failure.

**Contract**: `"use client"` at the top. Accepts `{ next: string }` props. Calls `useActionState(loginAction, null)` — destructures as `[errorMessage, dispatch, isPending]`. The `<form>` element's `action` prop is `dispatch`. Includes: a hidden input `name="next"` with `value={next}`, an email input `name="email"` (type `text`, autofocus), a password input `name="password"`, a submit button disabled when `isPending`, and a `<p role="alert">` that renders `errorMessage` when non-null.

No `onSubmit` with `FormEvent` — the `action` prop on `<form>` is the React 19 pattern (per `context/foundation/lessons.md`).

---

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `src/app/login/page.tsx` and `src/app/login/LoginForm.tsx` exist

#### Manual Verification:

- `npm run dev` → navigate to `http://localhost:3000/login` → form renders with email and password fields
- Enter wrong credentials → inline error message appears below the submit button; no page redirect
- Enter correct credentials → browser redirects toward `/office` (404 expected at this phase — the office page doesn't exist yet)
- Navigate to `http://localhost:3000/login?next=/office/calendar` → after successful login, browser redirects to `/office/calendar` (verify via DevTools Network tab)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 3.

---

## Phase 3: Protected Page Shells

### Overview

Create the service role Supabase client (needed to read instructor name by token), the office layout with a logout button, the office placeholder page, and the instructor page with token validation and name heading.

### Changes Required:

#### 1. Create `src/lib/supabase/service.ts`

**File**: `src/lib/supabase/service.ts`

**Intent**: Server-only factory for the Supabase service role client. Used wherever a server component needs to bypass RLS — specifically the instructor page's lookup of instructor name by token. Never imported by client components.

**Contract**: No directive (server-only). Reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `process.env`. Guard block: if either is missing, throws `new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — check .env.local')`. Re-binds to `validUrl` / `validServiceKey` constants after the guard so TypeScript narrows to `string` (no `!`). Named export `createServiceClient()` returns `createClient(validUrl, validServiceKey)` from `@supabase/supabase-js`.

---

#### 2. Create `src/app/office/layout.tsx`

**File**: `src/app/office/layout.tsx`

**Intent**: Shared layout for all `/office/*` pages. Holds the logout button so it persists across S-01 and S-02 screens without duplication.

**Contract**: Server Component accepting `{ children: React.ReactNode }`. Renders a `<header>` with a "DrivePlan" wordmark and a `<form>` containing a `<button>` whose `formAction` is `logoutAction` (imported from `@/app/actions/auth`). Wraps `{children}` in a `<main>`. No `"use client"` needed — `formAction` on a form button accepts a server action reference in Next.js 15+.

---

#### 3. Create `src/app/office/page.tsx`

**File**: `src/app/office/page.tsx`

**Intent**: Placeholder page so the `/office` route exists; middleware redirects after login have a valid destination. Replaced by S-01.

**Contract**: Default export returning a `<section>` with a heading "Office — coming in S-01". No data fetching.

---

#### 4. Replace `src/app/instructor/[token]/page.tsx`

**File**: `src/app/instructor/[token]/page.tsx`

**Intent**: Replace the null stub with token validation — look up the instructor by token using the service role client; 404 on unknown token; render the instructor's name heading for valid tokens. S-02 adds the lesson list below.

**Contract**: `async` default export accepting `{ params: Promise<{ token: string }> }`. Awaits `params`. Calls `createServiceClient()`, queries `instructors` with `.select('id, name').eq('token', token).maybeSingle()`. If `data` is null (unknown token, invalid UUID string, or any DB error), calls `notFound()` from `next/navigation`. On valid instructor, renders `<main>` with `<h1>Instructor: {data.name}</h1>` and a placeholder paragraph for the lesson list (S-02 fills this in).

---

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `src/lib/supabase/service.ts` exists
- `src/app/office/layout.tsx` and `src/app/office/page.tsx` exist
- `src/app/instructor/[token]/page.tsx` no longer returns `null`

#### Manual Verification:

- `npm run dev` → navigate to `http://localhost:3000/office` → placeholder heading visible, logout button in header
- Click logout → redirected to `/login`
- Navigate to `http://localhost:3000/instructor/<valid-seed-token>` (copy a token from Supabase dashboard → `instructors` table) → renders "Instructor: {name}" heading
- Navigate to `http://localhost:3000/instructor/00000000-0000-0000-0000-000000000000` → Next.js 404 page
- Navigate to `http://localhost:3000/instructor/not-a-uuid` → Next.js 404 page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 4.

---

## Phase 4: Middleware

### Overview

Replace the passthrough `middleware.ts` stub with the full implementation: session cookie refresh, office route protection with `?next=` redirect, and matcher configuration. Enable the four middleware integration tests.

### Changes Required:

#### 1. Replace `src/middleware.ts`

**File**: `src/middleware.ts`

**Intent**: Intercept every non-static request: refresh the Supabase Auth session cookie so it never expires silently mid-session, then redirect unauthenticated requests to `/office/*` to `/login?next=<path>`.

**Contract**: Async `middleware(request: NextRequest)` export. Inside the function:
1. Guard block: read `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `process.env`; throw a descriptive error if either is missing; re-bind to narrowed constants (no `!`).
2. Initialize `let supabaseResponse = NextResponse.next({ request })`.
3. Create a Supabase server client via `createServerClient` from `@supabase/ssr` with a cookie adapter: `getAll()` returns `request.cookies.getAll()`; `setAll(cookiesToSet)` mutates `request.cookies` and reassigns `supabaseResponse = NextResponse.next({ request })` before setting response cookies — this is the standard `@supabase/ssr` middleware pattern and is required to forward refreshed cookies.
4. Call `await supabase.auth.getUser()` to trigger session refresh.
5. If `request.nextUrl.pathname.startsWith('/office')` and `user` is null, return a redirect to `/login` with `next` set to `request.nextUrl.pathname`.
6. Return `supabaseResponse` (not a new `NextResponse.next()`) so refreshed cookie headers are forwarded to the browser.

Named export `config` with `matcher` array: `['/((?!_next/static|_next/image|favicon\\.ico).*)']`.

---

#### 2. Enable middleware integration tests in `src/middleware.test.ts`

**File**: `src/middleware.test.ts`

**Intent**: Remove `.todo()` markers and add real assertions so the middleware redirect behavior is automatically verified.

**Contract**: Add `const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'` at the top of the file. Replace all four `.todo()` calls with real `it()` blocks:

- Tests 1–3 (unauthenticated redirect): `fetch` the target path with `{ redirect: 'manual' }`, assert `res.status === 302` and `res.headers.get('location')` matches the expected path pattern.
- Test 4 (authenticated access): call `createTestAnonClient().auth.signInWithPassword({ email: process.env.OFFICE_EMAIL, password: process.env.OFFICE_PASSWORD })` in a `beforeAll`; extract the session cookie from the response; include it in the fetch; assert `res.status === 200`.

Guard env vars: throw a descriptive error if `OFFICE_EMAIL` or `OFFICE_PASSWORD` is undefined (same pattern as `test-client.ts`).

---

#### 3. Update `vitest.config.ts`

**File**: `vitest.config.ts`

**Intent**: Configure Vitest to start the Next.js dev server before running HTTP-level middleware tests.

**Contract**: Add a `webServer` object to the `test` config block:
- `command: 'npm run dev'`
- `url: 'http://localhost:3000'`
- `reuseExistingServer: !process.env.CI`
- `timeout: 120_000`

The `reuseExistingServer: true` setting (in local dev) avoids starting a second server when `npm run dev` is already running.

---

#### 4. Update `.env.test`

**File**: `.env.test`

**Intent**: Expose office account credentials to the Vitest test environment so the authenticated middleware test can sign in without hardcoding.

**Contract**: Add `OFFICE_EMAIL=<value>` and `OFFICE_PASSWORD=<value>` entries matching the Supabase Auth user created in Phase 1.

---

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `npm test` exits 0 (all 4 middleware tests pass; RLS tests still pass)

#### Manual Verification:

- Clear browser cookies → navigate to `http://localhost:3000/office` → browser URL shows `/login?next=%2Foffice`
- Log in → browser redirects to `/office`, placeholder page visible
- Log out → browser at `/login`
- Navigate to `/instructor/<valid-seed-token>` without a session → page renders (no auth redirect — instructor route is not behind office auth)
- Navigate to `/office/any-path` without session → redirected to `/login?next=%2Foffice%2Fany-path`

**Implementation Note**: After completing this phase and all verification passes, F-02 is complete.

---

## Testing Strategy

### Unit Tests:

None — the server actions and middleware are thin wrappers around the Supabase SDK; unit-testing them requires mocking the entire SDK which the project avoids.

### Integration Tests:

- `src/middleware.test.ts` — 4 HTTP-level tests enabled in Phase 4: three unauthenticated redirect assertions (302 + Location header) and one authenticated access assertion (200)
- `src/lib/supabase/rls.test.ts` — already passing; must continue to pass after F-02 (regression gate)

### Manual Testing Steps:

1. Login with wrong credentials → inline error, no redirect
2. Login with correct credentials → redirected to `/office`, logout button visible
3. Logout → redirected to `/login`
4. While logged out, navigate to `/office/any-route` → redirected to `/login?next=<path>`
5. Log in → redirected back to the original destination
6. `/instructor/<valid-seed-token>` while logged out → instructor name heading, no auth redirect
7. `/instructor/00000000-0000-0000-0000-000000000000` → 404

## Performance Considerations

`supabase.auth.getUser()` in middleware validates the JWT locally for non-expired tokens (no network call). Session refresh only hits Supabase when the token is near expiry. No significant latency impact.

## Migration Notes

No database migrations needed. All required RLS policies and the `get_instructor_lessons` RPC are deployed by F-01's migrations.

## References

- Roadmap F-02 spec: `context/foundation/roadmap.md` lines 65–77
- PRD Access Control: `context/foundation/prd.md` lines 104–112
- F-01 plan (client patterns and Key Discoveries): `context/changes/supabase-data-foundation/plan.md`
- Lessons: `context/foundation/lessons.md` (no `!`, no FormEvent, guard blocks)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth Account + Server Actions

#### Automated

- [x] 1.1 `npm run build` exits 0 — c6b144e
- [x] 1.2 `npm run lint` exits 0 — c6b144e
- [x] 1.3 `src/app/actions/auth.ts` exists — c6b144e

#### Manual

- [x] 1.4 Supabase dashboard shows office Auth user — c6b144e
- [x] 1.5 Office credentials in `.env.test` as `OFFICE_EMAIL` / `OFFICE_PASSWORD` — c6b144e

### Phase 2: Login Page

#### Automated

- [x] 2.1 `npm run build` exits 0 — 71d3436
- [x] 2.2 `npm run lint` exits 0 — 71d3436
- [x] 2.3 `src/app/login/page.tsx` and `src/app/login/LoginForm.tsx` exist — 71d3436

#### Manual

- [x] 2.4 `/login` form renders with email and password fields — 71d3436
- [x] 2.5 Wrong credentials → inline error, no redirect — 71d3436
- [x] 2.6 Correct credentials → redirects toward `/office` (404 expected at this phase) — 71d3436
- [x] 2.7 `?next=/office/calendar` honored in post-login redirect (verified via DevTools Network) — 71d3436

### Phase 3: Protected Page Shells

#### Automated

- [x] 3.1 `npm run build` exits 0
- [x] 3.2 `npm run lint` exits 0
- [x] 3.3 `src/lib/supabase/service.ts` exists
- [x] 3.4 `src/app/office/layout.tsx` and `src/app/office/page.tsx` exist
- [x] 3.5 `src/app/instructor/[token]/page.tsx` no longer returns `null`

#### Manual

- [x] 3.6 `/office` shows placeholder text and logout button
- [x] 3.7 Logout → `/login`
- [x] 3.8 `/instructor/<valid-seed-token>` → "Instructor: {name}" heading
- [x] 3.9 `/instructor/00000000-…` → 404
- [x] 3.10 `/instructor/not-a-uuid` → 404

### Phase 4: Middleware

#### Automated

- [ ] 4.1 `npm run build` exits 0
- [ ] 4.2 `npm run lint` exits 0
- [ ] 4.3 `npm test` exits 0 (all middleware + RLS tests pass)

#### Manual

- [ ] 4.4 Unauthenticated `/office` → redirected to `/login?next=%2Foffice`
- [ ] 4.5 Login → redirected to `/office`, page visible
- [ ] 4.6 Logout → `/login`
- [ ] 4.7 `/instructor/<token>` accessible without session (no redirect)
- [ ] 4.8 `/office/any-path` → redirected with correct `next` param
