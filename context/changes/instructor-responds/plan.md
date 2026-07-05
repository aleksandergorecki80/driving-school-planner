# Instructor Responds (S-02 rework) Implementation Plan

## Overview

Replace the roadmap's originally-proposed S-02 access model (a permanent per-instructor URL
token resolving to a list of that instructor's lessons) with a one-time, per-lesson token
delivered by email. The instructor opens a link scoped to exactly one lesson, sees only that
lesson's details, and approves or rejects it (optionally with a reason, optionally picked from
an AI-suggested candidate). The token is invalidated the instant a decision is recorded, the
office cancels the lesson, or the office manually regenerates it. Closes roadmap slice S-02
(`instructor-responds`) per `context/foundation/prd-v2.md`.

## Current State Analysis

`context/foundation/prd-v2.md`'s `## Constraints & Compatibility` section assumed
`instructors.token` and `get_instructor_lessons()` were dead code from a never-implemented
design, safe to delete with no compatibility burden. **Codebase research during planning found
this assumption is wrong** — both are live:

- `instructors.token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE` is defined in
  `supabase/migrations/20260614143835_initial_schema.sql:9` and has never been altered.
- `get_instructor_lessons(p_token uuid)` is a `SECURITY DEFINER` Postgres function
  (finalized in `supabase/migrations/20260627000003_fix_security_definer_explicit_columns.sql:6-36`)
  with `EXECUTE` granted to `anon` (`20260627000001_add_access_policies.sql:39`).
- `src/lib/supabase/rls.test.ts` calls this RPC directly via an anon client to assert IDOR
  protection (token A cannot see instructor B's lessons).
- `src/app/instructor/[token]/page.tsx` (30 lines) already queries `instructors` by `token`
  via the service-role client and renders a stub (`"Lesson schedule coming soon."`).
- `src/app/instructor/[token]/page.test.ts` has 3 `it.todo()` tests explicitly blocked on S-02
  landing, written against this exact route.

This plan treats the old mechanism as a real, tested feature to be **deliberately retired**
(Phase 2), not silently deleted. `instructors.categories`-based lesson creation, the
instructor-overlap/student-overlap/category-coherence guards in `createLesson`, and
`cancelLesson`'s soft-cancel pattern are all unaffected and stay exactly as they are.

`lessons.rejection_reason text` (nullable) already exists in the schema
(`20260614143835_initial_schema.sql`) — FR-005's optional reason needs no new column.

No email-sending or AI SDK dependency exists anywhere in `package.json` today — this plan
introduces the first two external-service integrations in the project.

## Desired End State

- A lesson row carries its own one-time `token`. It is set automatically at creation, nulled
  the instant a decision is recorded or the lesson is cancelled, and can be manually replaced
  by the office.
- The instructor reaches a lesson via `/lesson/<token>` (no login), sees only that lesson's
  date/time/student/category, and can approve (with a lightweight confirm step) or reject
  (optionally with a reason, freely typed or chosen from up to 5 AI-suggested candidates).
- Office creates a lesson → instructor gets an email with the link, automatically. Office can
  manually resend (regenerating the token) from the lesson's detail panel. Office can view/edit
  an instructor's email address.
- The old `/instructor/[token]` route, `instructors.token` column, and `get_instructor_lessons()`
  function no longer exist. `rls.test.ts`'s IDOR coverage moves to the new token model.
- **Verification**: `npm test` and `npm run build` both exit 0; the new `/lesson/[token]`
  integration tests prove a token cannot be reused after a decision, cancellation, or
  regeneration; `rls.test.ts` no longer references the retired function.

### Key Discoveries

- `createLesson` (`src/app/actions/lessons.ts:4-93`) already validates category-coherence and
  instructor/student overlap before inserting with `status: 'pending'` — this plan only adds a
  token + email side effect after a successful insert, no change to the validation logic.
- `cancelLesson` (`src/app/actions/lessons.ts:95-118`) does a conditional
  `.update({ status: 'cancelled' }).eq('id', lessonId).in('status', ['pending','confirmed'])` —
  the token-nulling addition is a one-field extension of the same update payload.
- `office_update_lessons` RLS policy (`20260628000001_add_cancelled_lesson_status.sql:12-13`)
  already grants `authenticated` (office) `UPDATE` on `lessons` with `USING (true)` — office-side
  actions (cancel, regenerate token) need no new RLS policy.
- No RLS policy grants `anon` any row-level access to `lessons` — the established pattern for
  anon+token access in this codebase is a `SECURITY DEFINER` function with an explicit `anon`
  `GRANT EXECUTE`, not a permissive RLS policy. The new instructor-write path follows this same
  pattern rather than introducing a second access mechanism.
- `src/lib/supabase/test-client.ts` already exports `createTestServiceRoleClient()`,
  `seedInstructor`, `seedStudent`, `cleanupRows` — every new test file reuses these, no new test
  fixtures needed except a lesson-seeding helper for tests that need a lesson already in a known
  state (pending with a known token) before exercising the RPC/action under test.
- `LessonPopover.tsx:51-62,114-124` establishes the UI pattern for a mutating office action:
  `useTransition` + server action call + local `error` state + `router.refresh()` + `onClose()`.
  The new "resend link" button follows this exact shape.
- `context/foundation/lessons.md` rules apply throughout: no `FormEvent` (use `action` prop —
  already the project convention, see `NewLessonForm.tsx:52,99`), no non-null assertion (`!`) —
  use guard blocks, explicit `ON DELETE` on any new foreign key (not needed here — no new FK is
  added, `lessons.token`/`instructors.email` are plain columns).

## What We're NOT Doing

- No dedicated instructor mobile app, no SMS delivery channel, no token TTL — per
  `prd-v2.md`'s Non-Goals, unchanged.
- No email delivery-status tracking or retry queue — best-effort send, office's only signal is
  instructor non-response (they can then use the "resend link" action).
- No broader instructor profile management UI — only the email field becomes editable
  (FR-013); name/categories stay pre-seeded/read-only.
- No changes to `createLesson`'s existing category-coherence, instructor-overlap, or
  student-overlap guards.
- No `lesson_tokens` history table (roadmap S-03's parked idea) — a single nullable
  `lessons.token` column with no audit trail, per the locked schema decision.
- No changes to the office login/session flow or `proxy.ts`'s `/office` gating.

## Implementation Approach

Schema and RPC functions land first (Phase 1) so every later phase — server actions, the new
instructor page, email, AI — has a stable foundation to build against and test independently.
The old mechanism is retired immediately after (Phase 2) rather than left to coexist, per the
clean-cutover decision — the two `token` concepts (per-instructor vs per-lesson) must not exist
side by side even temporarily, to avoid ambiguity about which one is "the" token during
development. Server actions, UI, and the two external integrations (email, AI) each land as
their own phase so they can be tested and reviewed independently; both external integrations are
mocked in automated tests per the established DB-integration-test convention (real Supabase,
mocked third-party APIs).

## Critical Implementation Details

**Token invalidation ordering (FR-006).** The PRD requires the token to be invalidated only
*after* the status write is confirmed — never before. `respond_to_lesson()` (Phase 1) satisfies
this by construction: the status update and the token nulling happen in the same `UPDATE`
statement inside one `SECURITY DEFINER` function call, so there is no window where one could
succeed without the other. Do not split this into two round-trips (e.g., update status from the
server action, then null the token in a second call) — that would reopen exactly the race FR-006
was written to close.

**Row locking under concurrent regenerate + respond.** `respond_to_lesson()` selects the lesson
`FOR UPDATE` before checking `status = 'pending'`. This matters because the office's "resend
link" action and the instructor's approve/reject click can race in principle (small school, low
concurrency, but the lock is one line and removes the class of bug entirely) — without it, an
instructor could submit a decision against a token the office just invalidated via regeneration.

## Phase 1: Schema & RPC foundation

### Overview

Add the two schema changes this feature needs (`lessons.token`, `instructors.email`) and the
two `SECURITY DEFINER` functions that let an unauthenticated instructor, holding only a token,
read and act on exactly one lesson.

### Changes Required:

#### 1. Migration — lesson token + instructor email columns

**File**: `supabase/migrations/<timestamp>_lesson_token_and_instructor_email.sql`

**Intent**: Add `lessons.token` (the per-lesson one-time token) and `instructors.email` (needed
for FR-002/FR-013). Ensure only lessons still awaiting a decision can ever carry a live token.

**Contract**:

```sql
ALTER TABLE lessons ADD COLUMN token uuid DEFAULT gen_random_uuid();
UPDATE lessons SET token = NULL WHERE status <> 'pending';
CREATE UNIQUE INDEX lessons_token_unique ON lessons (token) WHERE token IS NOT NULL;

ALTER TABLE instructors ADD COLUMN email text;
```

`token` is nullable with a default so every newly-inserted lesson gets one automatically
(`createLesson` needs no code change to generate it), while still allowing it to be set to
`NULL` once consumed. The partial unique index only constrains active tokens, so nulled rows
never collide. `email` is nullable — existing pre-seeded instructors have none until office adds
one via FR-013.

#### 2. Migration — token-gated read/write RPCs

**File**: `supabase/migrations/<timestamp>_lesson_token_functions.sql`

**Intent**: Provide the two `SECURITY DEFINER` entry points an anon+token instructor uses:
one read (fetch the single lesson a token resolves to) and one write (record a decision,
atomically nulling the token in the same statement).

**Contract**: `get_lesson_by_token(p_token uuid) RETURNS SETOF lessons` mirrors the existing
`get_instructor_lessons` shape (explicit column list, `SET search_path = public`,
`GRANT EXECUTE ... TO anon`), filtered by `token = p_token`. `respond_to_lesson` is the
non-obvious piece — locking + atomic write in one statement (see Critical Implementation
Details above):

```sql
CREATE OR REPLACE FUNCTION respond_to_lesson(p_token uuid, p_decision text, p_reason text DEFAULT NULL)
RETURNS TABLE(ok boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson_id uuid;
BEGIN
  IF p_decision NOT IN ('confirmed', 'rejected') THEN
    RETURN QUERY SELECT false, 'Invalid decision'; RETURN;
  END IF;

  SELECT id INTO v_lesson_id FROM lessons
  WHERE token = p_token AND status = 'pending'
  FOR UPDATE;

  IF v_lesson_id IS NULL THEN
    RETURN QUERY SELECT false, 'Link is no longer valid'; RETURN;
  END IF;

  UPDATE lessons
  SET status = p_decision::lesson_status, rejection_reason = p_reason, token = NULL
  WHERE id = v_lesson_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION get_lesson_by_token(uuid) TO anon;
GRANT EXECUTE ON FUNCTION respond_to_lesson(uuid, text, text) TO anon;
```

#### 3. Migration — compatibility fix for `get_instructor_lessons` (discovered during implementation)

**File**: `supabase/migrations/20260704213337_fix_get_instructor_lessons_return_type.sql`

**Intent**: Adding `lessons.token` widens the `lessons` composite type from 8 to 9 columns.
`get_instructor_lessons()` (still live — retired in Phase 2, not this one) declares `RETURNS
SETOF lessons` but its `RETURN QUERY` only selects the original 8 columns, which broke at
runtime (`42804`) the moment item 1's migration landed, failing `rls.test.ts`'s still-active
IDOR tests.

**Contract**: `DROP FUNCTION` + recreate `get_instructor_lessons` with an explicit `RETURNS
TABLE(...)` matching its original 8 columns (decoupled from `lessons`'s evolving shape, so it
doesn't leak the new `token` column), then re-`GRANT EXECUTE ... TO anon` (lost on drop). Purely
a transition-window compatibility fix — Phase 2 deletes this function entirely.

### Success Criteria:

#### Automated Verification:

- New integration test file (`src/lib/supabase/lesson-token.test.ts`) proves, via an anon
  client: a pending lesson's token resolves via `get_lesson_by_token`; an unknown/consumed token
  resolves to nothing; `respond_to_lesson` with a valid pending token flips status and nulls the
  token (verified by an independent service-role re-query); a second call with the same
  (now-stale) token returns `ok = false`
- `npm run build` exits 0
- `npm run lint` exits 0

#### Manual Verification:

- None — the integration tests are full verification for this phase

---

## Phase 2: Retire the old instructor-token mechanism

### Overview

Remove `instructors.token`, `get_instructor_lessons()`, and their `anon` grant now that Phase 1
provides the replacement — a deliberate cutover, not a no-op cleanup, since both are live and
tested today.

### Changes Required:

#### 1. Migration — drop old column and function

**File**: `supabase/migrations/<timestamp>_drop_instructor_token.sql`

**Intent**: Remove the superseded per-instructor token mechanism entirely.

**Contract**:
```sql
DROP FUNCTION IF EXISTS get_instructor_lessons(uuid);
ALTER TABLE instructors DROP COLUMN token;
```

#### 2. Remove obsolete RPC tests

**File**: `src/lib/supabase/rls.test.ts`

**Intent**: Remove the `describe`/`it` blocks asserting `get_instructor_lessons` IDOR behavior
(the function no longer exists). Any other RLS coverage in this file unrelated to instructor
tokens stays untouched.

**Contract**: Delete only the token-RPC-specific test block(s); the file's remaining structure
and imports stay as-is unless a block becomes empty, in which case remove the empty `describe`.

#### 3. Update the shared `seedInstructor` test fixture

**File**: `src/lib/supabase/test-client.ts`

**Intent**: `seedInstructor()` currently does
`.select('id, token, name, categories')` (used by every integration test file in the suite,
present and future). Once this phase drops `instructors.token`, that `.select()` fails at the
database level for every caller — not just the tests this phase removes — unless it's updated
first.

**Contract**: Change `seedInstructor()`'s `.select()` to `'id, name, categories'` and narrow its
return type to `{ id: string; name: string; categories: string[] }`.

### Success Criteria:

#### Automated Verification:

- `npm test` exits 0 with no reference to `get_instructor_lessons` or `instructors.token`
  remaining anywhere in `src/`
- `npm run build` exits 0 (confirms no remaining code references the dropped column/function)
- `npm run lint` exits 0

#### Manual Verification:

- None

---

## Phase 3: Server actions — respond, cancel-invalidates-token, regenerate

### Overview

Add the TypeScript server actions that wrap Phase 1's RPCs and extend the existing office-side
actions, following `lessons.ts`'s established `{ error?: string }` return convention.

### Changes Required:

#### 1. New anon-key client factory

**File**: `src/lib/supabase/anon.ts`

**Intent**: A plain, session-less Supabase client using the anon key — the same privilege level
tests already use to call `anon.rpc(...)`. This is what `respondToLesson` calls from, since the
instructor reaching it has no cookie/session at all.

**Contract**: Mirrors `src/lib/supabase/service.ts`'s shape (validate env vars with a guard
block per `lessons.md`'s no-`!` rule, export a synchronous factory function) but built with the
anon key instead of the service-role key.

#### 2. `respondToLesson` server action

**File**: `src/app/actions/lessons.ts`

**Intent**: Instructor-facing action — calls `respond_to_lesson` via the anon client and maps
its `{ ok, error_message }` result to this file's `{ error?: string }` convention.

**Contract**: `respondToLesson(token: string, decision: 'confirmed' | 'rejected', reason?: string): Promise<{ error?: string }>`.
No auth check (there is no session to check) — the token itself is the credential, validated
inside the RPC.

#### 3. `cancelLesson` — null the token on cancellation

**File**: `src/app/actions/lessons.ts`

**Intent**: A cancelled lesson's outstanding link must stop working (FR-009).

**Contract**: Add `token: null` to the existing `.update({ status: 'cancelled' })` payload at
`lessons.ts:101-104` — no other change to this function's logic or signature.

#### 4. `regenerateLessonToken` server action

**File**: `src/app/actions/lessons.ts`

**Intent**: Office-facing action — invalidates the current token and issues a new one for a
still-pending lesson, so a lost/expired link can be replaced.

**Contract**: `regenerateLessonToken(lessonId: string): Promise<{ error?: string; token?: string }>`.
Uses the authenticated `createClient()` (office session, same as `cancelLesson`), updates
`lessons.token` to a fresh `crypto.randomUUID()` filtered `.eq('status', 'pending')`, returns the
new token on success (the caller needs it to trigger the resend email in Phase 5) or
`{ error: 'Lesson not found or not pending' }` if no row matched.

### Success Criteria:

#### Automated Verification:

- New/extended tests in `src/app/actions/lessons.test.ts` (following the file's established
  auth-wiring and dual-assertion oracle pattern): `respondToLesson` confirms a pending lesson,
  rejects one with and without a reason, and returns an error for an already-consumed or unknown
  token; `cancelLesson` independently verified to null the token; `regenerateLessonToken`
  replaces the token and rejects lessons not in `pending` status
- `npm test` exits 0
- `npm run build` exits 0
- `npm run lint` exits 0

#### Manual Verification:

- None — the integration tests are full verification for this phase

---

## Phase 4: Instructor page at `/lesson/[token]`

### Overview

Replace `/instructor/[token]` with the new single-lesson page, mobile-first, wired to Phase 3's
actions, with the two-step confirm interaction for both approve and reject.

### Changes Required:

#### 1. Remove the old route

**File**: `src/app/instructor/[token]/page.tsx`, `src/app/instructor/[token]/page.test.ts`

**Intent**: Delete both — superseded entirely by the new route.

**Contract**: Directory `src/app/instructor/[token]/` no longer exists after this phase.

#### 2. New page

**File**: `src/app/lesson/[token]/page.tsx`

**Intent**: Server Component. Resolves the token via `get_lesson_by_token`; renders the lesson's
date/time/student/category and the response form, or an inline "this link is no longer valid"
message if the token resolves to nothing (do not use Next's generic `notFound()` — the PRD
specifies this exact wording as a distinct state, not a 404).

**Contract**: `params: Promise<{ token: string }>`, same async-params pattern as the old page.
A non-UUID `token` segment makes `get_lesson_by_token` return a Postgres/PostgREST error, not an
empty result — treat any error from the RPC the same as an empty result (the "link is no longer
valid" state), not an uncaught exception.

#### 3. Response form (client component)

**File**: `src/app/lesson/[token]/components/LessonResponseForm.tsx`

**Intent**: Approve and Reject buttons, each requiring a lightweight inline confirm step before
submitting (FR-004) — clicking Approve/Reject swaps the button for an inline "Are you sure? [Yes]
[Cancel]" state; only the "Yes" click calls `respondToLesson`. The Reject path additionally
opens a reason section (free text, always available, per FR-005) — the AI-suggested candidates
from Phase 6 slot into this same section without changing this contract.

**Contract**: Uses `action` on `<form>` per `lessons.md` (no `FormEvent`). Vertically-stacked
mobile-first layout, no horizontal scrolling, per the carried-over NFR.

### Success Criteria:

#### Automated Verification:

- New test file (`src/app/lesson/[token]/page.test.ts`, integration-level like
  `lessons.test.ts`) proves: a valid pending token's page shows the correct lesson fields; an
  invalid/consumed token shows the "no longer valid" message; approving updates status and
  nulls the token (verified via service-role oracle query); rejecting without a reason succeeds;
  rejecting with a reason persists it
- `npm run build` exits 0
- `npm run lint` exits 0

#### Manual Verification:

- Open a lesson link on a mobile-width viewport — no horizontal scrolling, no pinch-zoom needed
- Confirm the two-step approve/reject interaction feels deliberate, not accidental-tap-prone

---

## Phase 5: Email integration (Resend)

### Overview

Wire the first external service into the project: send the instructor their lesson link by
email, on creation and on manual regeneration.

### Changes Required:

#### 1. Dependency + env vars

**File**: `package.json`, `.env.example`

**Intent**: Add the `resend` package. Document the new required env vars following the existing
`.env.example` comment-then-key style.

**Contract**: `RESEND_API_KEY` (server-only secret) and `EMAIL_FROM` (the verified sender
address) added to `.env.example` with explanatory comments, mirroring the
`SUPABASE_SERVICE_ROLE_KEY` entry's "server-only, never expose to the browser" note.

#### 2. Send-link utility

**File**: `src/lib/email/sendLessonLink.ts`

**Intent**: One function, one job — compose and send the "a lesson needs your response" email
given an instructor's email address and the lesson's token/link.

**Contract**: `sendLessonLink(to: string, lessonLinkUrl: string): Promise<{ error?: string }>`.
Never throws — catches Resend errors and returns `{ error: ... }` so callers can degrade
gracefully (per the FR-002 Socratic resolution: a failed send must not fail the lesson creation
itself).

#### 3. Wire into `createLesson` and `regenerateLessonToken`

**File**: `src/app/actions/lessons.ts`

**Intent**: After a successful insert (createLesson) or token regeneration
(regenerateLessonToken), fetch the instructor's `email`; if present, call
`sendLessonLink`; if absent or the send fails, do not fail the parent operation — surface a
non-blocking `warning` field instead.

**Contract**: Both actions' return types gain an optional `warning?: string` field (additive,
non-breaking): `'Instructor has no email on file — link was not sent'` when `email` is null,
or the `sendLessonLink` error message when the send itself fails.

`createLesson`'s current insert (`lessons.ts:80-86`) is a bare `.insert({...})` with no
`.select()` — it never learns the DB-generated `token` value it needs to build
`lessonLinkUrl`. Change it to `.insert({...}).select('id, token').single()`, mirroring the
`.select(...).single()` pattern `cancelLesson` and `regenerateLessonToken` already use, and pass
the returned `token` into the `/lesson/<token>` URL before calling `sendLessonLink`.

### Success Criteria:

#### Automated Verification:

- Tests mock the `resend` module (`vi.mock('resend', ...)`, per the established
  mock-third-party/real-DB testing approach) and assert: `createLesson` calls
  `sendLessonLink` with the right recipient and a well-formed `/lesson/<token>` URL when the
  instructor has an email; `createLesson` still succeeds and returns a `warning` (not an
  `error`) when the instructor has no email; a mocked send failure surfaces as a `warning`, not
  a failed lesson creation; `regenerateLessonToken` triggers a new send with the new token
- `npm test` exits 0
- `npm run build` exits 0
- `npm run lint` exits 0

#### Manual Verification:

- Trigger a real lesson creation against a test Resend account/sandbox and confirm an email
  actually arrives with a working link

---

## Phase 6: AI-suggested rejection reasons (Vercel AI Gateway)

### Overview

Add the second external integration: on-demand, contextual candidate rejection reasons, with
mandatory graceful degradation per FR-012.

### Changes Required:

#### 1. Dependencies + env var

**File**: `package.json`, `.env.example`

**Intent**: Add the `ai` package and `zod` (for structured output validation). Document the
model choice as a configurable env var rather than a hardcoded string, so it can be swapped
without a code change.

**Contract**: `AI_SUGGESTION_MODEL` added to `.env.example`, defaulting to a small/cheap
gateway model string (e.g. `openai/gpt-4o-mini`) if unset.

#### 2. Suggestion function

**File**: `src/lib/ai/suggestRejectionReasons.ts`

**Intent**: Given a lesson's date, time, and category **only** (never the student's name or any
other student-identifying detail, per the resolved privacy constraint), return up to 5 short
candidate rejection reasons, or an empty array on any failure/timeout — never throws.

**Contract**: `suggestRejectionReasons(input: { scheduledAt: string; category: string }): Promise<string[]>`.
Uses `generateObject` from the `ai` package against a `zod` schema
(`z.object({ reasons: z.array(z.string()).max(5) })`), wrapped in a try/catch with a short
client-side-appropriate timeout; any error path returns `[]`.

#### 3. Wire into the reject flow

**File**: `src/app/lesson/[token]/components/LessonResponseForm.tsx`,
`src/app/actions/lessons.ts`

**Intent**: Call the suggestion function (via a server action wrapper) when the reject reason
section opens; render returned suggestions as quick-fill options above the always-available free
text field. An empty/slow result renders no suggestions but never disables the free-text/no-reason
submit path (the graceful-degradation requirement from FR-012).

**Contract**: `LessonResponseForm.tsx` is a client component and `suggestRejectionReasons` needs
server-only AI Gateway config, so it's called through a new `suggestRejectionReasonsAction(input:
{ scheduledAt: string; category: string }): Promise<string[]>` server action added to
`src/app/actions/lessons.ts`. The suggestion fetch is fire-and-forget relative to form
submission — nothing about submitting a rejection ever awaits or blocks on it.

### Success Criteria:

#### Automated Verification:

- Tests mock the `ai` package's `generateObject` (per the established mock-third-party
  approach) and assert: a successful call returns ≤5 reasons excluding any student-identifying
  input (the function signature itself makes this structurally impossible — no student field is
  ever passed in); a mocked failure/timeout returns `[]` without throwing; the reject flow's
  submit path is exercised and succeeds identically whether suggestions resolved or not
- `npm test` exits 0
- `npm run build` exits 0
- `npm run lint` exits 0

#### Manual Verification:

- On a real lesson link, open the reject flow and confirm suggestions appear and are usable;
  simulate a slow/failed suggestion call (e.g., temporarily invalid API key) and confirm
  rejection still submits normally via free text

---

## Phase 7: Office UI — resend link + instructor email field

### Overview

Surface the two remaining office-facing capabilities: manually resending a lesson's link
(FR-007) and viewing/editing an instructor's email address (FR-013).

### Changes Required:

#### 1. Resend-link button

**File**: `src/app/office/components/lesson-panel/LessonPopover.tsx`

**Intent**: Add a button next to the existing Cancel button, visible only when
`lesson.status === 'pending'`, calling `regenerateLessonToken`.

**Contract**: Follows the exact pattern already established for Cancel (`useTransition`, local
`error` state, `router.refresh()`, disabled+relabeled while pending) — no new UI pattern
introduced.

#### 2. Instructor email field

**File**: `src/app/office/components/sidebar/InstructorSidebar.tsx`,
`src/app/office/page.tsx`

**Intent**: Each instructor row gains a small inline-editable email field (FR-013) — the one
narrow exception to "no instructor profile management."

**Contract**: New server action `updateInstructorEmail(instructorId: string, email: string): Promise<{ error?: string }>`
in a new `src/app/actions/instructors.ts` file (separate from `lessons.ts` since it acts on the
`instructors` table), following the same auth/return-shape conventions as `lessons.ts`.

`office/page.tsx`'s instructors query (`.select('id, name, categories')`) must extend to
`.select('id, name, categories, email')` and pass `email` through to `InstructorSidebar`;
`InstructorSidebar`'s `Instructor` interface gains `email: string | null`. The edit itself is one
`<form action={updateInstructorEmail}>` per instructor row, per `lessons.md`'s no-`FormEvent`
rule — the same shape as Phase 4's `LessonResponseForm.tsx`, not an ad hoc onChange/onBlur
handler.

### Success Criteria:

#### Automated Verification:

- Test for `updateInstructorEmail` (new `src/app/actions/instructors.test.ts`): updates the
  email, verified via independent service-role re-query; rejects when unauthenticated
- `npm test` exits 0
- `npm run build` exits 0
- `npm run lint` exits 0

#### Manual Verification:

- Resend a link from the office UI and confirm a new email arrives with a different token than
  the original
- Edit an instructor's email in the sidebar and confirm the next lesson-creation email goes to
  the new address

---

## Phase 8: Documentation sync

### Overview

Bring foundation docs in line with the shipped reality — this phase is documentation-only, not
TDD'able, handled as plain edits.

### Changes Required:

#### 1. Roadmap status

**File**: `context/foundation/roadmap.md`

**Intent**: Flip S-02's `Status` from `proposed` to `done` (or `implemented`, matching this
project's existing status vocabulary) now that it has shipped in this reworked form.

#### 2. Test-plan cross-reference

**File**: `context/foundation/test-plan.md`

**Intent**: Update the Phase 3 ("Status loop correctness") row — this change directly unblocks
it (Risk #4/#5 both depend on S-02 existing). Link to this change folder.

#### 3. Change status

**File**: `context/changes/instructor-responds/change.md`

**Intent**: Set `status: implemented`.

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0

#### Manual Verification:

- `roadmap.md` S-02 row and `test-plan.md` Phase 3 row both reflect the current state

---

## Testing Strategy

### Unit Tests:

- Not applicable — every rule here depends on real DB state (token uniqueness, status
  transitions, RLS/RPC grants) that a unit-level mock would lie about, consistent with the
  project's existing testing strategy (`test-plan.md §1`).

### Integration Tests:

- Phase 1: RPC-level tests calling `get_lesson_by_token`/`respond_to_lesson` directly via an
  anon client, mirroring `rls.test.ts`'s existing pattern.
- Phase 3: server-action-level tests in `lessons.test.ts`, mirroring its existing
  auth-wiring + dual-assertion-oracle pattern.
- Phase 4: page-level tests for `/lesson/[token]`.
- Phases 5–6: same DB-integration approach, with the `resend` and `ai` modules mocked.
- Phase 7: server-action-level test for `updateInstructorEmail`.

### Manual Testing Steps:

1. Create a lesson as office; confirm the instructor receives an email with a working link.
2. Open the link on a mobile-width browser; approve it; confirm the office sees the status
   change on the next poll and the link no longer works if reopened.
3. Create a second lesson; reject it with an AI-suggested reason; confirm the office sees the
   reason.
4. Cancel a pending lesson from the office UI; confirm its link stops working.
5. Resend a lesson's link; confirm the old link stops working and the new one works.
6. Edit an instructor's email; confirm the next lesson email goes to the new address.

## Performance Considerations

No new performance-sensitive paths — email and AI calls happen on user-initiated actions (lesson
creation, reject-flow open), not on any polled or high-frequency path. The AI call must not
block form submission (see FR-012 graceful degradation, Critical Implementation Details).

## Migration Notes

Phase 1's `ALTER TABLE lessons ADD COLUMN token uuid DEFAULT gen_random_uuid()` populates a
token for every existing row (the default is evaluated per-row for volatile defaults), including
non-`pending` historical rows — the immediately-following `UPDATE ... SET token = NULL WHERE
status <> 'pending'` in the same migration cleans this up before the unique index is created, so
no historical/finalized lesson ever carries a live token.

## References

- Shaping session: `context/foundation/shape-notes.md`
- PRD (source of truth for scope): `context/foundation/prd-v2.md`
- Stack assessment: `context/foundation/stack-assessment.md`
- Health check: `context/foundation/health-check.md`
- Existing token pattern to mirror: `supabase/migrations/20260627000001_add_access_policies.sql`,
  `supabase/migrations/20260627000003_fix_security_definer_explicit_columns.sql`
- Existing server action conventions: `src/app/actions/lessons.ts:4-118`
- Existing test conventions: `src/app/actions/lessons.test.ts`, `src/lib/supabase/rls.test.ts`
- Existing office-UI mutation pattern: `src/app/office/components/lesson-panel/LessonPopover.tsx:51-62,114-124`
- Team conventions: `context/foundation/lessons.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & RPC foundation

#### Automated

- [x] 1.1 New RPC integration tests pass (`get_lesson_by_token`, `respond_to_lesson`) — 6762ccd
- [x] 1.2 `npm run build` exits 0 — 6762ccd
- [x] 1.3 `npm run lint` exits 0 — 6762ccd

### Phase 2: Retire the old instructor-token mechanism

#### Automated

- [x] 2.1 `npm test` exits 0 with no remaining reference to `get_instructor_lessons` or `instructors.token` — 80a9c6a
- [x] 2.2 `npm run build` exits 0 — 80a9c6a
- [x] 2.3 `npm run lint` exits 0 — 80a9c6a

### Phase 3: Server actions — respond, cancel-invalidates-token, regenerate

#### Automated

- [x] 3.1 `respondToLesson`/`cancelLesson`/`regenerateLessonToken` tests pass — df6f2fc
- [x] 3.2 `npm run build` exits 0 — df6f2fc
- [x] 3.3 `npm run lint` exits 0 — df6f2fc

### Phase 4: Instructor page at /lesson/[token]

#### Automated

- [ ] 4.1 New `/lesson/[token]` page tests pass
- [ ] 4.2 `npm run build` exits 0
- [ ] 4.3 `npm run lint` exits 0

#### Manual

- [ ] 4.4 Mobile-width viewport check — no horizontal scroll/pinch-zoom
- [ ] 4.5 Two-step confirm interaction feels deliberate

### Phase 5: Email integration (Resend)

#### Automated

- [ ] 5.1 Mocked-Resend tests pass (send success, no-email warning, send-failure warning, regenerate resend)
- [ ] 5.2 `npm run build` exits 0
- [ ] 5.3 `npm run lint` exits 0

#### Manual

- [ ] 5.4 Real email delivery confirmed via test Resend account

### Phase 6: AI-suggested rejection reasons

#### Automated

- [ ] 6.1 Mocked-AI tests pass (success, failure/timeout returns `[]`, submit path unaffected either way)
- [ ] 6.2 `npm run build` exits 0
- [ ] 6.3 `npm run lint` exits 0

#### Manual

- [ ] 6.4 Real suggestion call verified on a live lesson link
- [ ] 6.5 Simulated AI failure still allows rejection via free text

### Phase 7: Office UI — resend link + instructor email field

#### Automated

- [ ] 7.1 `updateInstructorEmail` test passes
- [ ] 7.2 `npm run build` exits 0
- [ ] 7.3 `npm run lint` exits 0

#### Manual

- [ ] 7.4 Resend-link button issues a working new link and invalidates the old one
- [ ] 7.5 Editing instructor email routes the next notification correctly

### Phase 8: Documentation sync

#### Automated

- [ ] 8.1 `npm run build` exits 0
- [ ] 8.2 `npm run lint` exits 0

#### Manual

- [ ] 8.3 `roadmap.md` and `test-plan.md` reflect current state
