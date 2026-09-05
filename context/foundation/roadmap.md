---
project: "DrivePlan"
version: 1
status: draft
created: 2026-06-04
updated: 2026-09-05 (GitHub open-issues sync)
prd_version: 1
main_goal: speed
top_blocker: capacity
---

# Roadmap: DrivePlan

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Driving schools today coordinate lessons over phone and SMS — every booking requires at least two calls, produces no durable record, and creates scheduling conflicts when calls are not returned. DrivePlan replaces that loop with a purpose-built scheduling tool that models the driving school domain: category-filtered instructor views, a pending/approve lesson workflow, and student linking. The primary user is office staff who need to book any lesson in under 60 seconds; the secondary user is the instructor, who approves or rejects proposals via a personal URL they open on their phone.

## North star

**S-02: Instructor views, approves, and rejects lessons; office sees status on next auto-poll** — the completion point of the full booking loop that proves the central product bet: phone-and-SMS coordination is replaced by the app. S-01 (office books a lesson) is the prerequisite; S-02 closes the loop.

> "North star" here means the slice whose delivery proves the core product hypothesis — the central bet that phone-and-SMS coordination can be replaced by this app. It is placed as early in the sequence as its prerequisites allow, because every other slice only matters if S-01 + S-02 work.

## At a glance

| ID   | Change ID                | Outcome (user can …)                                                                                                              | Prerequisites | PRD refs                              | Status   |
| ---- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| F-01 | supabase-data-foundation | (foundation) Supabase client wired; minimal schema and seed data in place                                                        | —             | FR-004, FR-006                        | done     |
| F-02 | auth-scaffold            | (foundation) Office login page functional; authenticated session gates all office routes; instructor URL token validated          | F-01          | FR-006                                | done |
| S-01 | office-books-lesson      | Office filters instructors by category, selects one, picks a date and time, attaches a student, and creates a pending lesson     | F-01, F-02    | US-01, FR-001, FR-002, FR-003, FR-004 | done     |
| S-02 | instructor-responds      | Instructor approves or rejects a lesson via a one-time emailed link scoped to that single lesson, optionally picking an AI-suggested rejection reason; office dashboard polls and shows the new status | S-01, F-02   | US-01, FR-001–003, FR-004(mod), FR-005(mod), FR-006–008, FR-009(mod), FR-010–011, FR-012, FR-013 (prd-v2.md) | done |
| S-03 | lesson-action-tokens     | *(merged into S-02, see below)*                                                                                                     | S-02          | —                                      | merged into S-02 |

## Baseline

What is already in place in the codebase as of 2026-06-04 (auto-researched + user-confirmed). Foundations below assume these layers are present and do NOT re-scaffold them.

- **Frontend:** present — Next.js 16.2.6 + React 19 + Tailwind CSS 4; App Router wired (`src/app/layout.tsx`, `src/app/page.tsx`)
- **Backend / API:** absent — no API routes, no route handlers, no server actions
- **Data:** absent — no Supabase client, no schema files, no seed data
- **Auth:** absent — no middleware, no session or token handling
- **Deploy / infra:** partial — `.vercel/` project metadata present (project is linked to Vercel); no GitHub Actions workflow, no `vercel.json`
- **Observability:** absent — no logging library, no error tracking

## Foundations

### F-01: Supabase wiring, minimal schema, and seed data

- **Outcome:** (foundation) Supabase client (`@supabase/supabase-js`, `@supabase/ssr`) installed and configured with env vars documented; database schema for `instructors`, `students`, and `lessons` tables created; instructors seeded with names and licence categories; students seeded with names, phone numbers, and category assignments.
- **Change ID:** supabase-data-foundation
- **PRD refs:** FR-004 (lessons entity and status field), FR-006 (instructor lookup by token), Business Logic (category–instructor–student coherence constraint embodied in schema)
- **Unlocks:** F-02 (Supabase Auth requires the project to be configured), S-01 (lesson creation depends on all three tables), S-02 (instructor token lookup and lesson status updates depend on schema)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** Exact instructor licence categories and student records need to be confirmed with the client before the seeder reflects real data. Owner: user. Block: no (placeholder data unblocks all development; real data replaces it before launch).
- **Risk:** Every downstream slice depends on this foundation; an incorrect schema ripples through S-01 and S-02. Risk is low — the domain model is simple (three entities, one foreign-key relationship each) and the PRD's Business Logic section specifies all three entities and their relationships explicitly.
- **Status:** done — implemented via `supabase-data-foundation` (commit `48941fb`, 2026-06-14; `change.md` status: impl_reviewed, updated 2026-06-20). GitHub issue #1 was correctly closed the same day; only this roadmap entry's own status field was left stale (still "ready") until synced 2026-08-30.

---

### F-02: Access control scaffold

- **Outcome:** (foundation) Login page at `/login` renders and issues a Supabase Auth session cookie for the office account; route protection rejects unauthenticated requests to all office routes; instructor routes validate the `token` URL parameter against the `instructors` table and reject unknown tokens.
- **Change ID:** auth-scaffold
- **PRD refs:** FR-006 (instructor URL token gate), Access Control section (office: Supabase Auth email+password; instructor: URL token, no login required)
- **Unlocks:** S-01 (office dashboard requires an authenticated session), S-02 (instructor page requires a valid URL token)
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Two distinct access models (session cookie for office, URL token for instructors) in the same middleware file increase the surface area for misconfiguration — for example, an instructor token accidentally granting access to office routes. Sequenced before any user-facing slice so auth boundaries are established and testable before protected pages are built on top of them.
- **Status:** done — implemented via `auth-scaffold` (`change.md` status: implemented, 2026-06-27); GitHub issue #2 closed 2026-08-29 after this roadmap entry was found stale (was still "proposed" despite the code shipping months earlier and S-01/S-02 depending on it since). Route protection lives in `src/proxy.ts`, not `middleware.ts` — this Next.js version renamed the convention; functionally the same gate. Covered by `src/middleware.test.ts`.

---

## Slices

### S-01: Office filters instructors by category and books a pending lesson

- **Outcome:** Office can log in, see a selected instructor's weekly calendar view, filter the instructor list by licence category so only matching instructors appear, select an instructor, pick a date and time slot, attach a student from the category-filtered list, and submit — a lesson with status "pending" is created in the database and visible when the instructor's calendar is next loaded.
- **Change ID:** office-books-lesson
- **PRD refs:** US-01, FR-001 (weekly calendar view per instructor), FR-002 (category filter), FR-003 (instructor selection by filter or full list), FR-004 (lesson creation → status "pending")
- **Prerequisites:** F-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - What time-slot granularity should the weekly calendar display (e.g., 30-minute slots, 1-hour slots)? Owner: user. Block: no (30-minute slots are a reasonable default that can be adjusted before launch without structural changes).
- **Risk:** The weekly calendar is the most UI-intensive component in the MVP; a third-party calendar library could become a time sink for a solo after-hours developer. Mitigation: render the week grid with plain Tailwind CSS rather than a full-featured library, consistent with the `speed` goal. Calendar interaction complexity is also bounded by the PRD (no drag-and-drop, no recurring events).
- **Status:** done

---

### S-02: Instructor responds to a lesson via a one-time emailed link; office sees the updated status via auto-poll

> **Redesigned 2026-07-04**, before implementation started. The original design below this
> line described a permanent, non-expiring per-instructor URL token resolving to a list of all
> that instructor's lessons — a standing security liability if the link ever leaked. It has been
> replaced by the one-time per-lesson token model described here. Full rationale, Socratic
> challenge log, and FR-by-FR delta live in `context/foundation/prd-v2.md` and
> `context/changes/instructor-responds/` (shape-notes.md, plan.md, plan-brief.md).

- **Outcome:** Office creates a lesson → a unique one-time token is generated automatically → the instructor receives an email with a link scoped to exactly that lesson → opening the link shows only that lesson's details (date, time, student) — no list of other lessons → the instructor approves (with a lightweight confirmation step) or rejects (optionally with a reason, freely typed or picked from up to 5 AI-suggested candidates) → the lesson status updates in the database and the token is invalidated → the office dashboard polls every 30 seconds and displays the new status and any rejection reason without a manual page reload. Office can manually regenerate a lesson's token (invalidating the prior one) to resend a lost link.
- **Change ID:** instructor-responds
- **PRD refs:** `context/foundation/prd-v2.md` — US-01, FR-001–003 (token generation, email delivery, single-lesson view), FR-004 (approve, modified — adds confirmation step), FR-005 (reject, modified — reason now optional), FR-006 (invalidate-on-write ordering), FR-007 (manual token regenerate), FR-008 (confirmation message), FR-009 (cancel invalidates token, modified), FR-010/FR-011 (office login + polling, preserved), FR-012 (AI-suggested rejection reasons, excludes student PII), FR-013 (reworked mid-implementation, 2026-07-11 — office can send a lesson-link email to a one-shot override address; `instructors.email` itself stays non-editable from the office UI and the override is never persisted)
- **Prerequisites:** S-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** — resolved. Rejection reason is optional; instructor may pick from up to 5 AI-suggested candidates or type free text. See `prd-v2.md` Open Questions (closed).
- **Risk:** The instructor-facing page must remain usable on a mobile browser without horizontal scrolling (carried-over NFR) — smaller in scope now than originally planned, since a single-lesson response page is simpler to make mobile-correct than a full weekly calendar view. Two new external dependencies (email delivery, AI-suggested reasons) must degrade gracefully — neither may block the instructor from submitting a decision (see `prd-v2.md` Constraints & Compatibility).
- **Status:** done — all 9 phases shipped (schema/RPC foundation, old-mechanism retirement, server actions, `/lesson/[token]` page, email integration, AI-suggested rejection reasons, office resend-link button + send-to-a-different-email override, office polling, docs sync). Phase 8 (office polling) closed a confirmed gap: the "office dashboard polls every 30 seconds" outcome above was claimed since Phase 1 but never actually implemented until 2026-07-11 — `src/lib/supabase/client.ts`, built for this in `supabase-data-foundation`, remains unused by design (the shipped approach is a full `router.refresh()` on an interval, not a lighter-weight client-side subscription). Phase 7 landed in two slices: the resend-link button, then the send-to-a-different-email override (reworked mid-implementation — see PRD refs above). **Known gap found during docs sync (2026-07-11):** the rejection reason is persisted correctly but is never displayed anywhere in the office UI (`LessonRow`, `office/page.tsx`'s query, and `LessonPopover.tsx` all omit it) — the outcome text above ("displays the new status and any rejection reason") is not fully accurate yet. Tracked as **TD-11** (GitHub issue #51, open), not blocking this slice's "done" status since the core approve/reject/poll loop works.

---

### S-03: One-time action tokens per lesson — merged into S-02

- **Outcome:** Superseded. This slice proposed a one-time link per lesson *layered on top of* a permanent instructor panel — but the permanent panel it depended on was never built. As of the 2026-07-04 S-02 rework, the one-time-per-lesson-token mechanism described here is not a future add-on; it **is** S-02's actual MVP design (see `context/foundation/prd-v2.md`). There is no remaining S-03 implementation step — S-02 delivers this directly.
- **Change ID:** lesson-action-tokens (retired — folded into `instructor-responds`)
- **PRD refs:** superseded by `prd-v2.md` FR-001–003, FR-006, FR-007
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** —
- **Status:** merged into S-02

---

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                                                    | Ready for `/10x-plan` | Notes                                      |
| ---------- | ------------------------ | ------------------------------------------------------------------------ | --------------------- | ------------------------------------------ |
| F-01       | supabase-data-foundation | Set up Supabase client, schema (instructors / students / lessons), seeds | done — see `change.md` | Shipped 2026-06-14 (`48941fb`); GitHub issue #1 was already closed same-day, only this roadmap entry's status field was stale until synced 2026-08-30 |
| F-02       | auth-scaffold            | Wire office Supabase Auth login + middleware + instructor token guard    | done — see `change.md`  | Shipped 2026-06-27; roadmap entry and GitHub issue #2 were left stale until closed 2026-08-29 |
| S-01       | office-books-lesson      | Office: category filter → instructor calendar → create pending lesson    | no                    | Requires F-01 and F-02 completed first     |
| S-02       | instructor-responds      | Instructor: one-time emailed link, approve/reject; office polls status   | done — see `plan.md`  | Redesigned 2026-07-04; all 9 phases shipped 2026-07-11. Office polling confirmed unimplemented (2026-07-10) and closed as Phase 8. FR-013 reworked mid-implementation to a non-persisted, one-shot send-override instead of an editable `instructors.email` field. |
| S-03       | lesson-action-tokens     | ~~One-time per-lesson token for approve/reject action~~                  | n/a — merged          | Merged into S-02 rework (2026-07-04); no longer tracked separately |
| TD-01      | lesson-category-invariant | Enforce student↔lesson category coherence server-side (Lesson aggregate + `EXCLUDE` constraints + tighten RLS) | done — see `plan.md` | ✅ Shipped 2026-08-29 (4 phases): `Lesson.propose()` aggregate + `book_lesson` RPC (`SECURITY DEFINER`) + two `EXCLUDE USING gist` constraints (instructor, student — proven under real concurrency) + `office_insert_lessons` dropped entirely. `createLesson.ts` rewritten into a thin coordinator; I1/I3/I4 error strings preserved byte-for-byte, I2 (student category) gets a new one. Proceeded with `category` as `text` (equality check, no enum) rather than waiting on the licence-category list — see Open Roadmap Questions below, now resolved for this item. Source: `context/domain/02-invariant-aggregate-refactor.md` (found 2026-08-02, module-4 DDD). |
| TD-02      | supabase-acl             | Introduce Anti-Corruption Layer for Supabase (ports + adapter in `src/lib/supabase/`) | no | 🟡 Architectural debt (not urgent): Supabase SDK + raw PostgREST shape leak through ~16 files; the "embed as object" workaround is duplicated 3× (`types.ts`, `regenerateLessonToken.ts`, `office/page.tsx`). Also remove dead service-role-key code. Success criterion: `grep '@supabase' src/` returns only `src/lib/supabase/` (+ `proxy.ts`). Source: `context/domain/03-anti-corruption-layer.md` (found 2026-08-02, module-4 DDD). |
| DOC-01     | sync-prd-fr013           | Update `prd-v2.md` FR-013 to match the shipped rework                     | done | ✅ Fixed 2026-09-05: `prd-v2.md` FR-013 and Non-Goals now describe the shipped one-shot, non-persisted `overrideEmail` instead of an editable `instructors.email` field. Source: `context/domain/01-domain-distillation.md` §KROK 5 #6 (found 2026-08-02, module-4 DDD). |
| TD-03      | shadcn-design-refresh    | Align UI with shadcn/ui blocks + wire up dark mode                        | done — merged (PR #65 + follow-up PR #67, both on `main`) | ✅ Design-system debt cleared: shadcn/ui installed and configured (`components.json`, full light/dark token set in `globals.css`); the mobile chip-overflow regression found by user testing post-review (F3 in impl-review) was fixed in PR #67 (2026-08-30, commit `86c50cb`). GitHub issue #54 closed 2026-09-05 — both PRs merged, nothing left pending. Source: `context/changes/shadcn-design-refresh/research.md` (found 2026-08-10, user-triggered design audit). |
| TD-04      | form-validation-library  | Adopt react-hook-form+zod for form validation (LoginForm, NewLessonForm)   | no | 🟡 Split off from TD-03's `/10x-plan` questioning (2026-08-30): whether to replace manual FormData+`useState` validation with `react-hook-form`+`zod` and shadcn's `<Form>` primitive is a real architecture decision (new dependency, rewrites two working forms) that shouldn't block the shadcn/dark-mode design-system plan. TD-03 proceeds with manual validation + presentational primitives only (`Card`/`Input`/`Label`/`Checkbox`); this item tracks the full migration as separate, unscheduled follow-up work. |
| TD-05      | vaul-base-ui-portal-race | Eliminate residual open-then-close race for Base UI Select/AlertDialog nested in a vaul Drawer | no | 🟡 Found during TD-03 Phase 5 implementation (2026-08-30): vaul's modal `Drawer` and Base UI's `Select`/`AlertDialog` conflict by default — Base UI portals to `document.body`, vaul's modal mode treats that as "outside" and blocks/closes it (documented, unresolved upstream: [vaul#429](https://github.com/emilkowalski/vaul/issues/429)). Worked around in `LessonPanel.tsx`/`NewLessonForm.tsx`/`LessonPopover.tsx` by pointing each popup's portal `container` at the consuming component's own root div (inside the Drawer's tracked subtree) plus `alignItemWithTrigger={false}` on `Select` — raised local e2e (`office-books-lesson.spec.ts`) reliability from ~0% to ~80%, but an intermittent "opens then immediately closes" race remains uneliminated in the rest. Options for a full fix, unexplored: replace vaul's `Drawer` with a Base UI-native sheet/dialog for `LessonPanel` (removes the cross-library conflict at the source, larger change); or root-cause the residual race directly (may require a vaul/Base UI version bump or an upstream fix). Source: `context/changes/shadcn-design-refresh/plan.md` Critical Implementation Details (Phase 5). |
| TD-06      | no-past-lesson-scheduling | Block booking a lesson with a scheduled time in the past | done — merged | ✅ Shipped 2026-09-04 (PR #70, 4 phases, `context/changes/no-past-lesson-scheduling/plan.md`): domain invariant (`Lesson.propose()` throws `PastScheduledAtError`), mirrored `book_lesson` RPC check (`SCHEDULED_AT_IN_PAST`, migration `20260901090000_book_lesson_past_scheduled_at.sql`), `createLesson.ts` error-message wiring, and a UI click-guard disabling past slots in `CalendarGrid` (first React component test in the repo, via `@testing-library/react` + `jsdom` scoped to that one file). Impl review verdict: APPROVED, 0 critical/warning findings, 2 low-impact observations (see `context/changes/no-past-lesson-scheduling/reviews/impl-review.md`). By deliberate design, clicking a disabled past slot is a silent no-op with no message — see TD-07. GitHub issue #68 closed by #70. |
| TD-07      | past-slot-click-feedback | Show feedback when clicking a disabled past-time slot in the office calendar | done — see `plan.md` | ✅ Shipped 2026-09-05 (2 phases, `context/changes/past-slot-click-feedback/plan.md`): installed shadcn's `sonner` toast component, mounted globally in `layout.tsx`; `CalendarGrid` now shows a toast ("Cannot schedule a lesson in the past", reusing the exact wording from `createLesson.ts`) on a disabled past-slot click instead of a silent no-op, with an inline dismiss button and a stable id so repeat clicks reset rather than stack. Found and fixed during manual verification: dropped `aria-disabled:pointer-events-none`, which was silently blocking the click event itself in real browsers (invisible to the existing jsdom test) — the guard now lives purely in JS. GitHub issue #71 closed. |
| TD-08      | calendar-week-transition-animation | Add a subtle transition animation when navigating between weeks | yes | 🟡 Flagged by user (2026-09-04): `WeeklyCalendar`'s Prev/Next navigation swaps the visible week instantly via `router.push()`, no transition. Add a subtle animation (slide/fade) on `CalendarGrid`'s content when the week changes. GitHub issue #72. |
| TD-09      | calendar-week-jump-picker | Add a date picker to jump directly to a week from the week-range label | yes | 🟡 Flagged by user (2026-09-04): the week-range label (e.g. "31 Aug – 6 Sept 2026", `formatWeekLabel()` in `WeeklyCalendar.tsx`) is plain non-interactive text — the only navigation is stepping one week at a time via Prev/Next. Make the label clickable, opening a calendar/date-picker to jump directly to an arbitrary week. GitHub issue #73. |
| TD-10      | override-email-inline-edit | Make the lesson-link recipient email inline-editable via a pencil icon | yes | 🟡 Flagged by user (2026-09-04): `OverrideEmailField` (`src/components/lesson/OverrideEmailField.tsx`) shows the recipient email as static text plus a checkbox that reveals a separate, blank input below when checked. Replace with a single field-like box showing the current email next to a pencil/edit icon — clicking it turns that same field editable in place, pre-filled with the current email. Used on both the new-lesson booking panel and the resend-link flow (both consume `OverrideEmailField`). GitHub issue #74. |
| TD-11      | office-rejection-reason-display | Show the persisted rejection reason in the office UI | yes | 🔴 Confirmed unmet must-have, not nice-to-have (`prd.md:58`, FR-008): `lessons.rejection_reason` is persisted correctly (proven since S-02 Phase 3) but never rendered — `LessonRow` type, `office/page.tsx`'s query, and `LessonPopover.tsx` all omit it. Fix shape is small: add the field to the type, select it in the query, render it in `LessonPopover` when `status === 'rejected'`. Mirrors `test-plan.md` §3 Phase 3's remaining gap. GitHub issue #51 (open). |
| TD-12      | test-data-cleanup-sweep | Sweep orphaned test-seeded rows out of the live Supabase instance | no | 🟡 Found 2026-07-05 during `instructor-responds` Phase 5 manual verification: integration tests run against the real hosted Supabase project (by design, no local Docker) and seed rows via `seedInstructor()`; a few (`test-instr-cat-*`, `test-instr-lessons-*`, `test-instr-no-email-*`) survived cleanup — likely an interrupted run rather than a systematic bug — and leak into the real office UI's instructor list. Fix options undecided: one-off manual delete, or a `globalSetup`/`globalTeardown` name-prefix sweep in `vitest.config.ts`. Not blocking. GitHub issue #35 (open). |
| TD-13      | cancel-lesson-single-to-maybesingle | Fix unreachable "not found" branch in `cancelLesson` | no | 🟡 Found 2026-07-05 during `instructor-responds` Phase 3: `cancelLesson` (`src/app/actions/lessons.ts`) uses `.single()` after an `.update()...in(...)` that can match zero rows — `.single()` throws a PostgREST error (`PGRST116`) in that case rather than returning `data: null`, so the intended `if (!data)` → "Lesson not found or already cancelled" branch never runs; callers see the raw Postgrest error instead. Same pattern already fixed in `regenerateLessonToken` by swapping to `.maybeSingle()`; apply the same fix here. No test currently exercises this path. GitHub issue #32 (open). |

## Open Roadmap Questions

1. **What exact licence categories does the school use (B, C, D, T, B+E, C+E…), and is the complete list finalized with the client?** — Owner: user. Block: F-01 (seed data uses placeholder categories until this is confirmed; does not block development, only the final seeder content). **No longer blocks TD-01** (`lesson-category-invariant`, shipped 2026-08-29) — the equality check didn't need the finalized list; still relevant only if `category` is later converted from `text` to a proper Postgres `enum`, a separate, unscheduled follow-up.

## Parked

- **Combined all-instructors calendar view (FR-001b)** — Why parked: PRD §Non-Goals; per-instructor view is the MVP shape.
- **Real-time push via Supabase Realtime** — Why parked: PRD §Non-Goals; polling every 30 seconds is indistinguishable in practice for a small school (FR-005 resolved as polling).
- **In-app instructor and student profile management** — Why parked: PRD §Non-Goals; both are pre-seeded, no create/edit/delete UI in MVP.
- **Email and SMS notifications** — Why parked: PRD §Non-Goals.
- **AI-suggested scheduling** — Why parked: PRD §Non-Goals; marked as future iteration.
- **Payments and invoices** — Why parked: PRD §Non-Goals.
- **Native mobile app** — Why parked: PRD §Non-Goals; instructor view is responsive web only.
- **Instructor self-service availability** — Why parked: PRD §Non-Goals; the office manages all scheduling.
- **GitHub Actions CI/CD workflow** — Why parked: `.vercel/` is already linked; manual deploys via the Vercel CLI are sufficient for MVP. Auto-deploy on merge is a developer-workflow polish item, not a user-facing feature.

## Done

- **S-01: Office can log in, see a selected instructor's weekly calendar view, filter the instructor list by licence category so only matching instructors appear, select an instructor, pick a date and time slot, attach a student from the category-filtered list, and submit — a lesson with status "pending" is created in the database and visible when the instructor's calendar is next loaded.** — Archived 2026-06-28 → `context/archive/2026-06-28-office-books-lesson/`. Lesson: —.
