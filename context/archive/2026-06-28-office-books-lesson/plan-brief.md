# Office Books Lesson (S-01) — Plan Brief

> Full plan: `context/changes/office-books-lesson/plan.md`

## What & Why

Build the office-facing lesson booking interface — the first user-facing slice of DrivePlan. The office currently books lessons by phone and SMS; this slice replaces that loop with a purpose-built weekly calendar where staff can filter instructors by category, view their schedule at a glance, and create or cancel lessons without leaving the page. It directly delivers US-01 (office books a pending lesson in under 60 seconds).

## Starting Point

Both prerequisites are complete: F-01 (Supabase schema, seed data) and F-02 (auth scaffold, middleware). The `src/app/office/page.tsx` is a static placeholder. The `lesson_status` enum has three values; a `cancelled` value and two missing RLS policies (INSERT/UPDATE on `lessons`) must be added before any write can succeed.

## Desired End State

The office user logs in and sees a two-panel page: a left sidebar listing instructors (filterable by category) and a weekly calendar grid for the selected instructor showing existing lessons as coloured blocks. Clicking an empty slot opens a slide-in panel to create a pending lesson; clicking an existing block opens a cancel popover. The full booking flow is achievable in under 60 seconds.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Calendar grid style | 7-column CSS grid, 30-min rows, plain Tailwind | Roadmap risk mitigation for solo after-hours developer; no library dependency | Plan |
| Calendar hours | 07:00–21:00 (28 rows) | Wider than typical school hours to avoid clipping edge cases | Plan |
| Instructor navigation | Left sidebar + category filter | Fastest path to the 60-second booking target; office can switch instructors without navigating away | Plan |
| Lesson creation entry point | Click empty slot → slide-in panel | Fewest clicks; instructor and time pre-filled from context | Plan |
| Lesson creation form | Slide-in right-side drawer | Office stays on the calendar; no navigation break | Plan |
| Existing lessons display | Coloured blocks (yellow=pending, green=confirmed) | Office needs to see availability at a glance; prevents double-booking at the UI level | Plan |
| Cancellation model | `cancelled` enum value + new migration | Preserves history; easier than hard-delete for future audit; consistent with lesson status approach | Plan |
| Data fetching | Server Component tree + URL params (`?instructor=`, `?week=`, `?category=`) | Matches existing project pattern (no API routes); bookmarkable state | Plan |
| Lesson duration | Fixed 1 hour (no new column) | All driving school lessons are 60 min; no schema complexity | Plan |
| Conflict guard | Server-side overlap check before INSERT | Defensive against race condition (two office tabs open simultaneously) | Plan |
| Testing | Playwright golden path + Vitest server action edge cases | E2E verifies US-01 end-to-end; Vitest covers conflict guard and cancel without a browser | Plan |

## Scope

**In scope:**
- Schema migration: `cancelled` enum value + INSERT/UPDATE RLS policies
- Server actions: `createLesson` (with overlap guard), `cancelLesson`
- Office page shell with URL-param-driven instructor/week/category state
- Instructor sidebar (Client Component) with category filter
- Weekly calendar grid (07:00–21:00, Mon–Sun, 30-min slots)
- Coloured lesson blocks with cancel popover
- Slide-in creation panel with filtered student dropdown
- Playwright E2E golden path + Vitest action tests

**Out of scope:**
- Real-time polling / status refresh (S-02)
- Instructor approve/reject flow (S-02)
- Combined all-instructors view (FR-001b, nice-to-have)
- Lesson editing (only cancel)
- Profile management for instructors or students

## Architecture / Approach

`src/app/office/page.tsx` is the Server Component root. It reads three URL search params (`?instructor=`, `?week=`, `?category=`) and fetches data server-side. The sidebar is a thin Client Component that pushes URL param changes. The calendar and lesson panel are Client Components that call server actions directly and call `router.refresh()` on mutation success to trigger a server re-render. No new API routes are introduced.

```
page.tsx (Server Component)
├── InstructorSidebar (Client) — category filter + instructor list → pushes URL params
└── LessonPanel (Client) — manages drawer/popover state
    ├── WeeklyCalendar (Client) — week nav + slot/lesson click forwarding
    │   └── CalendarGrid + LessonBlock
    ├── NewLessonForm (Client) — createLesson server action
    └── LessonPopover (Client) — cancelLesson server action
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Schema | `cancelled` enum value + INSERT/UPDATE RLS policies | Missing policies → silent write failures in all later phases |
| 2. Server actions | `createLesson` (with overlap guard) + `cancelLesson` | Supabase JS client has no date arithmetic — boundaries must be computed in JS |
| 3. Office shell | Page layout + sidebar with category filter + URL routing | Nested `overflow` requires a fixed-height outer container or children can't scroll |
| 4. Calendar grid | Weekly grid, lesson blocks, week navigation | CSS grid slot positioning formula must be correct or blocks render in wrong cells |
| 5. Lesson panel | Slide-in creation drawer + cancel popover | React 19 forms: must use `action` prop, not `onSubmit` + `FormEvent` |
| 6. Tests | Playwright golden path + Vitest edge cases | E2E test must clean up created lesson in `afterEach` to avoid test pollution |

**Prerequisites:** F-01 and F-02 complete (confirmed); Supabase local stack running (`npx supabase start`); `.env.test` populated with `OFFICE_EMAIL`/`OFFICE_PASSWORD`  
**Estimated effort:** ~3–4 sessions across 6 phases

## Open Risks & Assumptions

- `56px` header height is assumed from visual inspection — extract as a CSS variable if it changes
- Lesson duration is hardcoded at 60 minutes; a future `duration_minutes` column will require a migration and calendar block height changes
- The `?week=` ISO Monday derivation relies on the server's timezone; ensure Supabase timestamps are stored and compared in UTC consistently

## Success Criteria (Summary)

- Office can propose a pending lesson (filter → instructor → slot → student → submit) in under 60 seconds from login
- Existing lessons are visible as coloured blocks; double-booking returns an inline error
- Cancelled lessons disappear from the calendar without a page reload
