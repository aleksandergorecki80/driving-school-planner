# Instructor Responds (S-02 rework) — Plan Brief

> Full plan: `context/changes/instructor-responds/plan.md`

## What & Why

Closes roadmap slice S-02: the instructor side of the booking loop. Replaces the roadmap's
originally-proposed access model (one permanent link per instructor, listing all their lessons)
with a one-time link per lesson, because a permanent non-expiring credential is a standing
security liability if it ever leaks. The instructor gets a fresh email every time a lesson needs
their response and acts on exactly that one lesson.

## Starting Point

S-01 (office books a lesson) is fully implemented. Planning research found that S-02's *old*
design is not, as assumed, dead code: `instructors.token` and the `get_instructor_lessons()`
RPC are live in the schema, tested in `rls.test.ts`, and already backing a stub
`/instructor/[token]` page with 3 blocked `it.todo()` tests. This plan retires that mechanism
deliberately rather than building around it.

## Desired End State

Office creates a lesson → instructor gets an email → opens a link scoped to that one lesson →
approves or rejects (optionally with a reason, optionally AI-suggested) → the link stops working
immediately. Office can resend a lost link or edit an instructor's email at any time.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Old-mechanism migration | Clean cutover — remove `instructors.token`/`get_instructor_lessons()` and their tests | Both are real, tested code; leaving them creates two conflicting "token" concepts | Plan (research corrected PRD) |
| Route | New `/lesson/[token]`, old `/instructor/[token]` deleted | URL should reflect that the token now scopes to a lesson, not an instructor | Plan |
| Token storage | Single nullable `lessons.token` column | Simplest option; no audit-trail requirement in scope | Plan |
| Write path | `SECURITY DEFINER` SQL function (`respond_to_lesson`), same pattern as the existing read RPC | One established access pattern for anon+token, not two | Plan |
| Email provider | Resend | Best Next.js/Vercel-native fit, well documented | Plan |
| AI suggestions | Real call via Vercel AI Gateway (`ai` package), model swappable via env var | Matches PRD's literal "AI-suggested" requirement | Plan |
| Confirm-step UX | Inline two-step button (no modal) | Best fit for a mobile-only, no-login page | Plan |
| External-service testing | Mock Resend/AI in tests; keep DB integration real | Matches project's existing "real DB, no mocking business logic" convention while avoiding cost/flakiness from paid third-party APIs | Plan |

## Scope

**In scope:**
- Lesson-scoped one-time token (schema + RPCs + server actions)
- New instructor page, single lesson, approve/reject with optional reason
- Email delivery on creation + manual resend
- AI-suggested rejection reasons (contextual, privacy-safe, non-blocking on failure)
- Office UI: resend-link button, editable instructor email field
- Retirement of the old instructor-token mechanism and its tests

**Out of scope:**
- Instructor mobile app, SMS delivery, token TTL, delivery-status tracking
- Broader instructor profile management (only email becomes editable)
- Token regeneration history/audit trail

## Architecture / Approach

Two new `SECURITY DEFINER` Postgres functions (mirroring the existing token-RPC pattern) give an
unauthenticated, token-holding instructor read and write access to exactly one lesson row, with
no new RLS policy for `anon`. TypeScript server actions wrap these RPCs following the existing
`lessons.ts` conventions. Two new, isolated library modules (`src/lib/email/`, `src/lib/ai/`)
hold the only code that talks to third-party services, each with a single narrow function
signature and mandatory graceful failure — so the office/instructor flows never hard-depend on
an external service being up.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Schema & RPC foundation | `lessons.token`, `instructors.email`, `get_lesson_by_token`, `respond_to_lesson` | Getting the atomic invalidate-on-write ordering right (FR-006) |
| 2. Retire old mechanism | Drop `instructors.token`/`get_instructor_lessons()`, clean up `rls.test.ts` | Missing a lingering reference breaks the build |
| 3. Server actions | `respondToLesson`, token-nulling `cancelLesson`, `regenerateLessonToken` | Concurrent regenerate vs. respond race (mitigated by row lock in Phase 1) |
| 4. Instructor page | `/lesson/[token]`, two-step confirm UI | Mobile layout regression |
| 5. Email (Resend) | Send-on-create, send-on-resend | First external dependency — must degrade gracefully |
| 6. AI suggestions | Contextual reject-reason candidates | Must never block submission on failure |
| 7. Office UI | Resend-link button, instructor email field | None significant — follows existing UI pattern |
| 8. Docs sync | Roadmap/test-plan status update | None — documentation only |

**Prerequisites:** None outstanding — S-01 and the corrected understanding of the existing
schema are both in hand.
**Estimated effort:** ~3 weeks after-hours (per `prd-v2.md`'s timeline budget), 8 phases.

## Open Risks & Assumptions

- Resend and the Vercel AI Gateway are assumed available/configurable in this project's Vercel
  account — not verified during planning (account-level, out of scope for a code plan).
- The exact AI Gateway model string (`AI_SUGGESTION_MODEL` default) may need retuning post-launch
  for cost/quality; it's env-configurable specifically so this doesn't require a code change.

## Success Criteria (Summary)

- An instructor can approve or reject a lesson from a one-time emailed link, on a phone, without
  logging in.
- A consumed, cancelled, or superseded link never works twice.
- The office sees the updated status and any rejection reason on the next poll, with no
  regression to any existing office-side lesson-management behavior.
