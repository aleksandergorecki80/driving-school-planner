# Office Books Lesson (S-01) Implementation Plan

## Overview

Build the office-facing lesson booking interface. The placeholder `src/app/office/page.tsx` is replaced with a two-panel layout: a left sidebar listing instructors (filterable by licence category) and a main weekly calendar grid. Clicking an empty slot opens a slide-in creation panel; clicking an existing lesson opens a cancel popover. One migration adds the `cancelled` lesson status and the missing INSERT/UPDATE RLS policies. All reads are server-side; mutations are server actions.

## Current State Analysis

Both prerequisites are complete:

- **F-01** — `instructors`, `students`, `lessons` tables in place with RLS enabled; seed data loaded (5 instructors, 8 students)
- **F-02** — Login, middleware proxy, office layout, and instructor token page all working; existing auth action pattern established in `src/app/actions/auth.ts`

`src/app/office/page.tsx` is a static placeholder. The office layout (`src/app/office/layout.tsx`) wraps children in `<main className="p-6">`.

**RLS gap**: `20260627000001_add_access_policies.sql` grants `authenticated` role `SELECT` on all three tables but has no `INSERT` or `UPDATE` policies for `lessons`. Without them, `createLesson` and `cancelLesson` will fail silently.

**Enum gap**: `lesson_status` is `pending | confirmed | rejected`. The `cancelled` value must be added before the cancel action can write it.

## Desired End State

The office user logs in and sees a two-panel page:

1. Left sidebar: all instructors listed; a category dropdown above narrows the list
2. Main area: weekly calendar grid (Mon–Sun, 07:00–20:30, 30-min rows) for the selected instructor

From here the office can:
- Filter instructors by category; click one to load their calendar
- Navigate weeks with Prev/Next buttons
- See existing lessons as coloured blocks (yellow = pending, green = confirmed)
- Click an empty slot → slide-in right panel → pick category and student → submit → lesson appears as a yellow pending block
- Click an existing block → popover with details + Cancel → block disappears

The `cancelled` status exists in the DB; active calendars filter it out. `createLesson` guards against double-booking at the server layer.

### Key Discoveries

- `instructors.categories` is `text[]` — filter with `.contains('categories', [category])`
- `students.category` is `text` (single value) — filter with `.eq('category', category)`
- `lessons.scheduled_at` is `timestamptz`; no `duration_minutes` column — all lessons are exactly 1 hour by convention
- Lesson status enum needs a fourth value: `cancelled` (new migration)
- RLS: authenticated role has `SELECT` only on `lessons`; `INSERT` and `UPDATE` policies are absent (must be added in the same migration)
- No `src/lib/db/` module — server components read the DB inline (per `src/app/instructor/[token]/page.tsx` pattern); mutations live in `src/app/actions/`
- React 19 forms: use `action` prop on `<form>` with `useTransition`, never `onSubmit` + `FormEvent` (see `lessons.md`)

## What We're NOT Doing

- No combined all-instructors calendar view (FR-001b, nice-to-have)
- No real-time push or polling — S-02 delivers that; this slice only creates the lesson
- No lesson editing — only cancel
- No instructor or student profile management
- No auto-scroll to current time in the calendar
- No drag-and-drop rescheduling

## Implementation Approach

Server-Component-first: `src/app/office/page.tsx` reads `?instructor=`, `?week=`, and `?category=` URL search params and fetches data server-side. The sidebar is a Client Component that pushes URL param changes via `useRouter`. The lesson panel and cancel popover are Client Components that call server actions imported directly, use `useTransition` for pending state, and call `router.refresh()` on success.

## Critical Implementation Details

**RLS INSERT/UPDATE policies are absent on `lessons`**: The Phase 1 migration must add `office_insert_lessons` and `office_update_lessons` alongside the enum change. Without them, `createLesson` and `cancelLesson` return an empty Supabase error with no thrown exception — a silent failure that is hard to trace.

**CSS grid slot positioning**: The weekly grid has one time-label column (column 1) and seven day columns (columns 2–8). Rows: 1 header row + 28 slot rows (07:00–20:30 in 30-minute steps). A lesson at `scheduled_at` maps to:
- `slotIndex = (hours - 7) * 2 + Math.floor(minutes / 30)` (0-indexed)
- `gridRow = slotIndex + 2`, spanning `gridRow / gridRow + 2` (two rows = 1 hour)
- `gridColumn = dayOfWeekMonday0 + 2` (Monday = 0 → column 2, Sunday = 6 → column 8)

Lesson blocks are sibling grid items with explicit `grid-row` and `grid-column` styles — they overlay the background cells without wrapping them.

**Overflow in nested flex containers**: For the sidebar and calendar to independently scroll, the page's outer flex container must have a fixed height (`h-[calc(100vh-56px)]` or equivalent, subtracting the header). Without constraining the outer height, `overflow-y-auto` on children has no effect — the page simply grows taller.

**`ALTER TYPE ... ADD VALUE` ordering**: PostgreSQL 14 allows this inside a transaction, but the new enum value cannot be referenced in a subsequent SQL statement within the same migration file. The migration should only add the value and the RLS policies — no INSERT or SELECT using `'cancelled'` in the same file.

**Week start alignment**: `?week=` holds the ISO date of the week's Monday (`YYYY-MM-DD`). When absent, derive today's Monday in the server component: `const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day`. Week range for the query: `[weekStart 00:00:00, weekStart + 7 days 00:00:00)`.

---

## Phase 1: Schema — `cancelled` status + INSERT/UPDATE policies

### Overview

Adds the `cancelled` enum value to `lesson_status` and the two missing RLS policies so server actions can write to the `lessons` table as an authenticated user.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_add_cancelled_lesson_status.sql`

**Intent**: Add `cancelled` to the `lesson_status` enum, then grant INSERT and UPDATE rights on `lessons` to the `authenticated` role. No SELECT or DELETE policies are needed here — SELECT already exists; hard-delete is not used (cancellation uses the status field).

**Contract**:
```sql
ALTER TYPE lesson_status ADD VALUE 'cancelled';

CREATE POLICY "office_insert_lessons"
  ON lessons FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "office_update_lessons"
  ON lessons FOR UPDATE TO authenticated USING (true);
```

Use `now()` in the filename timestamp so it sorts after the existing migrations.

### Success Criteria

#### Automated Verification

- Migration applies without error: `npx supabase db push`
- Enum includes `cancelled`: `SELECT enum_range(null::lesson_status)` returns all four values
- Policies present: `SELECT policyname FROM pg_policies WHERE tablename = 'lessons'` includes `office_insert_lessons` and `office_update_lessons`
- Type check passes: `npm run build`
- Lint passes: `npm run lint`

**Implementation Note**: Pause here after all automated verification passes before proceeding to Phase 2.

---

## Phase 2: Server actions — `createLesson` and `cancelLesson`

### Overview

Adds the two lesson mutations as `'use server'` functions. `createLesson` checks for overlapping active lessons before inserting. `cancelLesson` sets `status = 'cancelled'`.

### Changes Required

#### 1. Lesson server actions

**File**: `src/app/actions/lessons.ts`

**Intent**: Export `createLesson` and `cancelLesson` as server actions. Both use `createClient()` from `@/lib/supabase/server` (authenticated session, not service client — the new RLS policies gate writes to authenticated users).

**Contract**:

```typescript
export async function createLesson(data: {
  instructorId: string
  studentId: string
  category: string
  scheduledAt: string   // ISO 8601 timestamp
}): Promise<{ error?: string }>

export async function cancelLesson(
  lessonId: string
): Promise<{ error?: string }>
```

Overlap check in `createLesson`: compute `slotEnd = new Date(scheduledAt + 60 min).toISOString()`. Query `lessons` for rows where `instructor_id = instructorId`, `status NOT IN ('cancelled', 'rejected')`, `scheduled_at < slotEnd`, AND `scheduled_at >= scheduledAt - 60 min` (i.e., any lesson whose start falls within the 60-minute window). If any row exists, return `{ error: 'This slot is already booked' }` without inserting.

Since the Supabase JS client has no date arithmetic, compute boundary timestamps in JavaScript and pass them as ISO strings to `.lt()` / `.gte()` filter calls.

No non-null assertions (`!`) — follow the guard-block pattern from `lessons.md`.

### Success Criteria

#### Automated Verification

- Type check passes: `npm run build`
- Lint passes: `npm run lint`
- Vitest: `createLesson` inserts a row with `status = 'pending'` and returns `{}`
- Vitest: `createLesson` returns `{ error: 'This slot is already booked' }` for an exact slot duplicate
- Vitest: `cancelLesson` sets `status = 'cancelled'` on the target row

**Implementation Note**: Pause here after automated verification passes before proceeding to Phase 3.

---

## Phase 3: Office page shell + instructor sidebar

### Overview

Rewrites `src/app/office/page.tsx` from its placeholder to a two-panel Server Component. Adds a Client Component sidebar with a category filter dropdown and a scrollable instructor list.

### Changes Required

#### 1. Office page (Server Component)

**File**: `src/app/office/page.tsx`

**Intent**: Read `?instructor=`, `?week=`, and `?category=` search params. Fetch the instructor list (optionally filtered by category) and — when `instructor` param is set — fetch that instructor's non-cancelled lessons for the selected week, joined with student name. Pass data down as props to the sidebar and calendar components.

**Contract**:
```typescript
interface PageProps {
  searchParams: Promise<{
    instructor?: string
    week?: string       // YYYY-MM-DD, Monday
    category?: string
  }>
}
```

Reads via `createClient()` from `@/lib/supabase/server`. Instructor filter: if `category` param present, use `.contains('categories', [category])`. Lessons query: `status != 'cancelled'`, `scheduled_at >= weekStart`, `scheduled_at < weekEnd`, `.select('*, students(name)')`.

Outer layout: `<div className="flex h-[calc(100vh-56px)] gap-0">` — sidebar on the left, calendar (or an empty-state prompt) on the right. The `56px` constant matches the header's `py-3` line-height; extract as a Tailwind arbitrary value or a CSS variable if the header height changes.

#### 2. Instructor sidebar (Client Component)

**File**: `src/app/office/InstructorSidebar.tsx`

**Intent**: Renders a scrollable instructor list with a category filter `<select>` above it. Selecting a category or clicking an instructor pushes updated URL params via `useRouter`.

**Contract**: Props: `{ instructors: Array<{ id: string; name: string; categories: string[] }>, selectedId?: string, selectedCategory?: string }`. Width: `w-56 shrink-0 overflow-y-auto border-r border-zinc-200`. The unique category list is derived client-side from all `categories` arrays (flatten, deduplicate, sort). Selecting an instructor sets both `?instructor=<id>` and preserves `?category=` and `?week=` params.

### Success Criteria

#### Automated Verification

- Type check passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Visiting `/office` shows the sidebar with all 5 seeded instructors
- Selecting category "B" shows only Jan Kowalski, Anna Nowak, and Maria Dąbrowska
- Clicking an instructor updates the URL to include `?instructor=<uuid>` without a full page navigation flicker
- With no instructor selected, the main area shows a "Select an instructor" prompt

**Implementation Note**: Pause here after manual verification passes before proceeding to Phase 4.

---

## Phase 4: Weekly calendar grid + lesson blocks

### Overview

Adds the visual calendar grid. A Client Component handles week navigation and click forwarding. A sub-component renders the CSS grid with time labels, day headers, empty slot cells, and lesson blocks.

### Changes Required

#### 1. Weekly calendar (Client Component)

**File**: `src/app/office/WeeklyCalendar.tsx`

**Intent**: Wraps the calendar grid. Renders week navigation (Prev/Next buttons + week label). Handles slot clicks and lesson-block clicks by calling callbacks passed from the parent. Week navigation pushes `?week=<ISO-Monday>` via `useRouter` while preserving `?instructor=` and `?category=`.

**Contract**:
```typescript
interface Props {
  instructor: { id: string; name: string }
  lessons: Array<{
    id: string
    scheduled_at: string
    status: 'pending' | 'confirmed'
    students: { name: string }
    category: string
  }>
  weekStart: Date
  onSlotClick: (date: Date) => void
  onLessonClick: (lesson: LessonRow) => void
}
```

Fills `flex-1 flex flex-col overflow-hidden`. The grid itself scrolls vertically inside a `flex-1 overflow-y-auto` container.

#### 2. Calendar grid

**File**: `src/app/office/CalendarGrid.tsx`

**Intent**: Renders the 7-column CSS grid. Column 1: time labels. Columns 2–8: Mon–Sun. Row 1: day headers. Rows 2–29: 30-minute slot cells. Lesson blocks are placed using explicit `gridRow` and `gridColumn` inline styles (see Critical Implementation Details for the mapping formula). Empty slot cells emit `onClick` to trigger lesson creation.

**Contract**: Props: `{ days: Date[], lessons: LessonRow[], onSlotClick: (date: Date) => void, onLessonClick: (lesson: LessonRow) => void }`. Grid template: `grid-template-columns: 4rem repeat(7, 1fr); grid-template-rows: 2.5rem repeat(28, 2rem)`. Empty cells use `cursor-pointer hover:bg-zinc-50` styling. Lesson blocks are rendered as sibling grid items (not children of slot cells) so they can span multiple rows.

#### 3. Lesson block

**File**: `src/app/office/LessonBlock.tsx`

**Intent**: Coloured, clickable block for an existing lesson. Derives grid placement from `scheduled_at`. Stops click propagation to prevent the underlying empty-slot handler from firing simultaneously.

**Contract**: Props: `{ lesson: LessonRow & { students: { name: string } }, onClick: () => void }`. Background: pending = `bg-yellow-200 border border-yellow-400`, confirmed = `bg-green-200 border border-green-400`. Shows student name truncated to one line. Placement: inline `style={{ gridRow: '...', gridColumn: '...' }}` computed from the mapping formula in Critical Implementation Details.

### Success Criteria

#### Automated Verification

- Type check passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Calendar shows Mon–Sun column headers and time labels 07:00 through 20:30
- Week navigation Prev/Next updates `?week=` and rerenders the correct Monday–Sunday range
- Empty slots show a hover highlight on mouse-over
- Any seed lessons (create one manually via Supabase Studio if needed) appear as coloured blocks at the correct time and day

**Implementation Note**: Pause here after manual verification passes before proceeding to Phase 5.

---

## Phase 5: Lesson creation panel + cancel popover

### Overview

Adds the interactive layer on top of the calendar. A state-managing Client Component responds to slot clicks (open creation drawer) and lesson-block clicks (open cancel popover).

### Changes Required

#### 1. Lesson panel state manager (Client Component)

**File**: `src/app/office/LessonPanel.tsx`

**Intent**: Owns `mode: 'idle' | 'create' | 'detail'` state and the selected slot/lesson. Wraps `<WeeklyCalendar>` and renders either `<NewLessonForm>` or `<LessonPopover>` based on mode. This is what `src/app/office/page.tsx` renders in the main area (instead of `<WeeklyCalendar>` directly).

**Contract**: Props: everything `WeeklyCalendar` needs plus `instructor`, `availableStudents` (all students), and `activeCategory` (from URL `?category=` param). The slide-in drawer: a fixed `<div>` on the right side of the viewport, `translate-x-0` when open and `translate-x-full` when closed, with a `transition-transform` CSS class.

#### 2. New lesson form

**File**: `src/app/office/NewLessonForm.tsx`

**Intent**: Form inside the slide-in panel. Category `<select>` (pre-filled from `activeCategory`), student `<select>` filtered client-side by selected category, read-only date+time display pre-filled from the clicked slot. Submits by calling `createLesson(...)` via `useTransition`. On success, calls `router.refresh()` then `onSuccess()`. Shows inline error text on conflict without closing the panel.

**Contract**: Props: `{ instructor: { id: string; name: string }, slot: Date, students: Array<{ id: string; name: string; category: string }>, activeCategory?: string, onSuccess: () => void, onClose: () => void }`. Use `action` on `<form>` (not `onSubmit` + `FormEvent` — React 19 pattern per `lessons.md`). Use `useTransition` to track pending state and disable the submit button while in-flight.

#### 3. Lesson detail popover

**File**: `src/app/office/LessonPopover.tsx`

**Intent**: Small panel showing the clicked lesson's category, student name, scheduled time, and status. Contains a "Cancel lesson" button that calls `cancelLesson(lesson.id)` via `useTransition`. On success, calls `router.refresh()` and `onClose()`.

**Contract**: Props: `{ lesson: LessonRow & { students: { name: string } }, onClose: () => void }`. Renders as a fixed right-side panel (same drawer pattern as `NewLessonForm`) or a centred modal — whichever is simpler to implement consistently with the creation panel.

### Success Criteria

#### Automated Verification

- Type check passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- Clicking an empty slot opens the slide-in panel; date and time are pre-filled
- Selecting category "B" in the panel shows only B-category students in the dropdown
- Submitting valid data closes the panel; the new lesson appears as a yellow block at the correct grid position
- Submitting to a slot already occupied by an active lesson shows "This slot is already booked" inline without closing the panel
- Clicking an existing lesson block opens the popover with the correct student name, category, and status label
- Clicking "Cancel lesson" removes the block from the calendar
- The complete golden-path flow (filter → instructor → click slot → pick student → submit → lesson visible) is achievable in under 60 seconds

**Implementation Note**: Pause here after all manual verification passes before proceeding to Phase 6.

---

## Phase 6: Tests

### Overview

Adds a Playwright E2E test covering the golden path and Vitest unit tests for the two server actions.

### Changes Required

#### 1. Playwright E2E test

**File**: `e2e/office-books-lesson.spec.ts`

**Intent**: Logs in as the office user, selects an instructor, clicks a free slot, fills the creation form, and asserts the new lesson block appears. Cleans up the created lesson after the test.

**Contract**: Follow the pattern from `e2e/seed.spec.ts`. Guard env vars without `!` — use a guard block per `lessons.md`:
```typescript
const email = process.env.OFFICE_EMAIL
const password = process.env.OFFICE_PASSWORD
if (!email || !password) throw new Error('OFFICE_EMAIL and OFFICE_PASSWORD must be set in .env.test')
```
Locators: `getByRole` / `getByLabel` / `getByText` throughout; no CSS selectors or XPath. Wait for state: `waitForURL`, `toBeVisible`, `waitForResponse` — never `page.waitForTimeout()`.

Scenario: login → sidebar shows instructors → click category B filter → click "Jan Kowalski" → calendar loads → click an empty slot on a future weekday → panel opens with pre-filled time → select category B → select student "Adam Wójcik" → submit → panel closes → a yellow block with "Adam Wójcik" is visible on the calendar. Clean up via `cancelLesson` (imported server action) in `afterEach`.

#### 2. Vitest server action tests

**File**: `src/app/actions/lessons.test.ts`

**Intent**: Tests `createLesson` and `cancelLesson` against the real Supabase test database (same pattern as `src/middleware.test.ts`). Each test generates a unique timestamp-based slot to avoid collisions between runs.

**Contract**: Tests:
1. `createLesson` happy path: inserts a lesson row with `status = 'pending'` and returns `{}`
2. `createLesson` conflict: calling again with the same instructor + slot returns `{ error: 'This slot is already booked' }`
3. `cancelLesson`: sets the target lesson's `status` to `'cancelled'`

Clean up inserted rows in `afterEach` using the service client (bypasses RLS for cleanup).

### Success Criteria

#### Automated Verification

- Playwright E2E golden path passes: `npx playwright test e2e/office-books-lesson.spec.ts`
- Vitest action tests pass: `npx vitest run src/app/actions/lessons.test.ts`
- Type check passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification

- No regressions in the login flow (`/login` → `/office` redirect still works)
- No regressions in the instructor token page (`/instructor/<valid-token>` still renders)

---

## Testing Strategy

### Unit Tests (Vitest)

- `createLesson`: happy path inserts row with `status = 'pending'`
- `createLesson`: conflict returns `{ error: 'This slot is already booked' }`
- `cancelLesson`: sets `status = 'cancelled'`

### E2E Tests (Playwright)

- Golden path: login → category filter → select instructor → click slot → pick student → submit → pending block visible

### Manual Testing Steps

1. Filter by category C — only Anna Nowak and Piotr Wiśniewski appear in the sidebar
2. Click an empty Tuesday slot at 09:00 — slide-in panel opens showing "09:00, Tuesday"
3. Create a lesson (category B, student Adam Wójcik) — yellow block appears at 09:00–10:00
4. Click the same 09:00 slot — panel shows "This slot is already booked"
5. Click the yellow block — popover shows "Adam Wójcik", category B, status Pending, and a Cancel button
6. Cancel — block disappears from the calendar
7. Navigate Prev/Next week — calendar rerenders for the correct week

## References

- PRD: `context/foundation/prd.md` (US-01, FR-001–FR-004)
- Roadmap slice: `context/foundation/roadmap.md` (S-01)
- Seed data: `supabase/seed.sql`
- Auth action pattern: `src/app/actions/auth.ts`
- Server component DB read pattern: `src/app/instructor/[token]/page.tsx`
- E2E test pattern: `e2e/seed.spec.ts`
- Initial schema: `supabase/migrations/20260614143835_initial_schema.sql`
- Access policies: `supabase/migrations/20260627000001_add_access_policies.sql`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema — `cancelled` status + INSERT/UPDATE policies

#### Automated

- [x] 1.1 Migration applies without error: `npx supabase db push` — be6a9bd
- [x] 1.2 Enum includes `cancelled`: `SELECT enum_range(null::lesson_status)` — be6a9bd
- [x] 1.3 Policies `office_insert_lessons` and `office_update_lessons` in `pg_policies` — be6a9bd
- [x] 1.4 Type check passes: `npm run build` — be6a9bd
- [x] 1.5 Lint passes: `npm run lint` — be6a9bd

### Phase 2: Server actions — createLesson and cancelLesson

#### Automated

- [x] 2.1 Type check passes: `npm run build`
- [x] 2.2 Lint passes: `npm run lint`
- [x] 2.3 Vitest: `createLesson` inserts row and returns `{}`
- [x] 2.4 Vitest: `createLesson` returns conflict error for duplicate slot
- [x] 2.5 Vitest: `cancelLesson` sets `status` to `'cancelled'`

### Phase 3: Office page shell + instructor sidebar

#### Automated

- [ ] 3.1 Type check passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 All 5 seeded instructors visible in sidebar on `/office`
- [ ] 3.4 Category B filter shows only instructors holding category B
- [ ] 3.5 Clicking an instructor updates `?instructor=` URL param
- [ ] 3.6 No instructor selected: main area shows a prompt

### Phase 4: Weekly calendar grid + lesson blocks

#### Automated

- [ ] 4.1 Type check passes: `npm run build`
- [ ] 4.2 Lint passes: `npm run lint`

#### Manual

- [ ] 4.3 Calendar shows Mon–Sun columns and time labels 07:00–20:30
- [ ] 4.4 Week navigation updates `?week=` and shows the correct date range
- [ ] 4.5 Empty slots show hover highlight
- [ ] 4.6 Existing lessons appear as coloured blocks at the correct grid position

### Phase 5: Lesson creation panel + cancel popover

#### Automated

- [ ] 5.1 Type check passes: `npm run build`
- [ ] 5.2 Lint passes: `npm run lint`

#### Manual

- [ ] 5.3 Clicking empty slot opens slide-in panel with pre-filled date and time
- [ ] 5.4 Category selection in panel filters student dropdown correctly
- [ ] 5.5 Submitting valid lesson closes panel and shows yellow block on calendar
- [ ] 5.6 Submitting to occupied slot shows inline error without closing panel
- [ ] 5.7 Clicking existing block opens popover with correct lesson details
- [ ] 5.8 Cancelling lesson removes block from calendar
- [ ] 5.9 Full golden-path flow completes in under 60 seconds

### Phase 6: Tests

#### Automated

- [ ] 6.1 Playwright golden path passes: `npx playwright test e2e/office-books-lesson.spec.ts`
- [ ] 6.2 Vitest action tests pass: `npx vitest run src/app/actions/lessons.test.ts`
- [ ] 6.3 Type check passes: `npm run build`
- [ ] 6.4 Lint passes: `npm run lint`

#### Manual

- [ ] 6.5 No regressions in login flow
- [ ] 6.6 No regressions in instructor token page
