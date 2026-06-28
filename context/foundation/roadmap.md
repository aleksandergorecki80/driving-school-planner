---
project: "DrivePlan"
version: 1
status: draft
created: 2026-06-04
updated: 2026-06-04
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
| S-01 | office-books-lesson      | Office filters instructors by category, selects one, picks a date and time, attaches a student, and creates a pending lesson     | F-01, F-02    | US-01, FR-001, FR-002, FR-003, FR-004 | proposed |
| S-02 | instructor-responds      | Instructor views their lessons via URL token and approves or rejects with a reason; office dashboard polls and shows the new status | S-01, F-02   | US-01, FR-005, FR-006, FR-007, FR-008 | proposed |
| S-03 | lesson-action-tokens     | Office sends instructor a one-time action link per lesson; clicking approve/reject invalidates the token                           | S-02          | FR-007, FR-008                        | parked   |

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
- **Status:** proposed

---

### S-02: Instructor responds to a lesson; office sees the updated status via auto-poll

- **Outcome:** Instructor opens their unique URL on a mobile browser, sees their pending and confirmed lessons in a mobile-friendly calendar without horizontal scrolling, taps Approve or Reject on a pending lesson (Reject requires a short reason — free text), and the lesson status updates in the database; the office dashboard polls every 30 seconds and displays the new status (pending → confirmed or rejected) and any rejection reason without a manual page reload.
- **Change ID:** instructor-responds
- **PRD refs:** US-01, FR-005 (polling-based status refresh), FR-006 (instructor URL token view), FR-007 (approve), FR-008 (reject with reason)
- **Prerequisites:** S-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Should rejection reasons be free text, a fixed option list, or both? PRD accepts either. Owner: user. Block: no (free text is the simpler default; a fixed option list can be added before launch if the office finds free text inconsistent).
- **Risk:** The instructor view must be usable on a mobile browser without horizontal scrolling (PRD NFR). A weekly grid designed for desktop will not automatically reflow to mobile. This risk is contained to one component (the instructor calendar page) rather than spreading to the office view; design the instructor view as a vertically-scrolling day list for mobile from the start rather than attempting to refit a desktop grid.
- **Status:** proposed

---

### S-03: One-time action tokens per lesson

- **Outcome:** When office creates a lesson, a one-time link (`/lesson/<token>`) is generated and sent to the instructor; the instructor clicks Approve or Reject — the token is consumed and the link stops working. The instructor's permanent panel (`/instructor/<token>`) remains unaffected.
- **Change ID:** lesson-action-tokens
- **PRD refs:** FR-007 (approve), FR-008 (reject with reason)
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Introduces a second access model for approve/reject alongside the existing instructor panel. Requires a new `lesson_tokens` table and a new `app/lesson/[token]/page.tsx` route.
- **Status:** backlog

---

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                                                    | Ready for `/10x-plan` | Notes                                      |
| ---------- | ------------------------ | ------------------------------------------------------------------------ | --------------------- | ------------------------------------------ |
| F-01       | supabase-data-foundation | Set up Supabase client, schema (instructors / students / lessons), seeds | yes                   | Run `/10x-plan supabase-data-foundation`   |
| F-02       | auth-scaffold            | Wire office Supabase Auth login + middleware + instructor token guard    | no                    | Requires F-01 completed first              |
| S-01       | office-books-lesson      | Office: category filter → instructor calendar → create pending lesson    | no                    | Requires F-01 and F-02 completed first     |
| S-02       | instructor-responds      | Instructor: view lessons via token, approve/reject; office polls status  | no                    | Requires S-01 and F-02 completed first     |
| S-03       | lesson-action-tokens     | One-time per-lesson token for approve/reject action                      | no                    | Parked — post-MVP; requires S-02           |

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
- **S-03: One-time per-lesson action tokens (lesson-action-tokens)** — Why parked: post-MVP enhancement; S-01 + S-02 complete the core booking loop without it. Requires S-02.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips the matching item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.)
