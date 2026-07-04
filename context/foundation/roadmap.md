---
project: "DrivePlan"
version: 1
status: draft
created: 2026-06-04
updated: 2026-07-04
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
| F-01 | supabase-data-foundation | (foundation) Supabase client wired; minimal schema and seed data in place                                                        | —             | FR-004, FR-006                        | ready    |
| F-02 | auth-scaffold            | (foundation) Office login page functional; authenticated session gates all office routes; instructor URL token validated          | F-01          | FR-006                                | proposed |
| S-01 | office-books-lesson      | Office filters instructors by category, selects one, picks a date and time, attaches a student, and creates a pending lesson     | F-01, F-02    | US-01, FR-001, FR-002, FR-003, FR-004 | done     |
| S-02 | instructor-responds      | Instructor approves or rejects a lesson via a one-time emailed link scoped to that single lesson, optionally picking an AI-suggested rejection reason; office dashboard polls and shows the new status | S-01, F-02   | US-01, FR-001–003, FR-004(mod), FR-005(mod), FR-006–008, FR-009(mod), FR-010–011, FR-012, FR-013 (prd-v2.md) | proposed — redesigned |
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
- **Status:** ready

---

### F-02: Access control scaffold

- **Outcome:** (foundation) Login page at `/login` renders and issues a Supabase Auth session cookie for the office account; `middleware.ts` rejects unauthenticated requests to all office routes; instructor routes validate the `token` URL parameter against the `instructors` table and reject unknown tokens.
- **Change ID:** auth-scaffold
- **PRD refs:** FR-006 (instructor URL token gate), Access Control section (office: Supabase Auth email+password; instructor: URL token, no login required)
- **Unlocks:** S-01 (office dashboard requires an authenticated session), S-02 (instructor page requires a valid URL token)
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Two distinct access models (session cookie for office, URL token for instructors) in the same middleware file increase the surface area for misconfiguration — for example, an instructor token accidentally granting access to office routes. Sequenced before any user-facing slice so auth boundaries are established and testable before protected pages are built on top of them.
- **Status:** proposed

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
- **PRD refs:** `context/foundation/prd-v2.md` — US-01, FR-001–003 (token generation, email delivery, single-lesson view), FR-004 (approve, modified — adds confirmation step), FR-005 (reject, modified — reason now optional), FR-006 (invalidate-on-write ordering), FR-007 (manual token regenerate), FR-008 (confirmation message), FR-009 (cancel invalidates token, modified), FR-010/FR-011 (office login + polling, preserved), FR-012 (AI-suggested rejection reasons, excludes student PII), FR-013 (office-editable instructor email)
- **Prerequisites:** S-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** — resolved. Rejection reason is optional; instructor may pick from up to 5 AI-suggested candidates or type free text. See `prd-v2.md` Open Questions (closed).
- **Risk:** The instructor-facing page must remain usable on a mobile browser without horizontal scrolling (carried-over NFR) — smaller in scope now than originally planned, since a single-lesson response page is simpler to make mobile-correct than a full weekly calendar view. Two new external dependencies (email delivery, AI-suggested reasons) must degrade gracefully — neither may block the instructor from submitting a decision (see `prd-v2.md` Constraints & Compatibility).
- **Status:** proposed — access-model redesign complete (`context/changes/instructor-responds/plan.md`, 8 phases); implementation not started.

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
| F-01       | supabase-data-foundation | Set up Supabase client, schema (instructors / students / lessons), seeds | yes                   | Run `/10x-plan supabase-data-foundation`   |
| F-02       | auth-scaffold            | Wire office Supabase Auth login + middleware + instructor token guard    | no                    | Requires F-01 completed first              |
| S-01       | office-books-lesson      | Office: category filter → instructor calendar → create pending lesson    | no                    | Requires F-01 and F-02 completed first     |
| S-02       | instructor-responds      | Instructor: one-time emailed link, approve/reject; office polls status   | done — see `plan.md`  | Redesigned 2026-07-04; plan written, implementation not started |
| S-03       | lesson-action-tokens     | ~~One-time per-lesson token for approve/reject action~~                  | n/a — merged          | Merged into S-02 rework (2026-07-04); no longer tracked separately |

## Open Roadmap Questions

1. **What exact licence categories does the school use (B, C, D, T, B+E, C+E…), and is the complete list finalized with the client?** — Owner: user. Block: F-01 (seed data uses placeholder categories until this is confirmed; does not block development, only the final seeder content).

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
