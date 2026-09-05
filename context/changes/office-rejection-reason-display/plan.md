# Office Rejection Reason Display Implementation Plan

## Overview

Surface the already-persisted `lessons.rejection_reason` in the office UI. Today it is written correctly by the reject flow but never read back or rendered anywhere on the office side — a confirmed unmet must-have (`prd.md:58`, FR-008; tracked as roadmap TD-11 / GitHub issue #51).

## Current State Analysis

- `LessonRow` (`src/app/office/components/types.ts:3-9`) has no `rejection_reason` field.
- `OfficePage`'s lessons query (`src/app/office/page.tsx:50`) selects `'id, scheduled_at, status, category, students(name)'` — `rejection_reason` is not fetched.
- `LessonPopover.tsx` renders `status` via `LESSON_STATUS[lesson.status]` (line 45, 103) but has no row for the reason. It already has a `lesson.status !== 'rejected'` conditional (line 132, gating the cancel button) — confirming `rejected` is a distinguishable, already-branched-on state.
- `rejection_reason` is a nullable `text` column with no length constraint (`supabase/migrations/20260614143835_initial_schema.sql:30`), written by the `respond_to_lesson` RPC, forced to `NULL` unless the decision is `rejected` (`supabase/migrations/20260705155520_scope_rejection_reason_to_rejected_decision.sql:28`). The "AI-suggested reasons" the instructor can pick from are pre-fill buttons for the same free-text field (`src/app/lesson/[token]/components/LessonResponseForm.tsx`) — there is no enum or separate structured format to account for.
- `DetailRow` (`src/components/lesson/DetailRow.tsx:3-15`) is a simple `{label, value}` presentational component already used for every other field in the popover (Instructor, Student, Category, Scheduled) — the natural fit for a new "Rejection reason" row.

## Desired End State

When an office user opens the lesson detail popover for a rejected lesson that has a stored rejection reason, they see a "Rejection reason" row with the full text. Non-rejected lessons, and rejected lessons with no reason (instructor rejected without typing one), show no such row. Verified by rejecting a lesson end-to-end (via `/lesson/[token]`) and opening its popover in `/office`.

### Key Discoveries:

- The reason is always plain free text with no length cap — the popover body is already `overflow-y-auto` (`LessonPopover.tsx:95`), so no new truncation/scroll handling is needed.
- Scope is deliberately limited to `LessonPopover` — `LessonBlock`/`CalendarGrid` have no tooltip surface today and adding one is out of scope for this change (see What We're NOT Doing).

## What We're NOT Doing

- Not adding a tooltip/`title` attribute to `LessonBlock` or `CalendarGrid` — the reason is only shown in the popover detail panel, not at-a-glance on the calendar grid.
- Not adding a new `LessonPopover.test.tsx` — this is a pure rendering addition on an existing conditional (`status === 'rejected'`), consistent with the project's existing "don't test static/low-blast-radius UI" convention (`test-plan.md` §7). A broken selector or type would already fail `npm run typecheck`/`npm run build`.
- Not adding truncation, "show more" affordances, or any length limit on the displayed text.
- Not changing the `respond_to_lesson` RPC, the reject form, or any other part of the write path — this is read/render-only.

## Implementation Approach

Thread the field through the existing three-layer path (type → query → render) that every other lesson field already follows in this file set. No new components, no schema changes, no new dependencies.

## Phase 1: Surface rejection_reason in office UI

### Overview

Add `rejection_reason` to the `LessonRow` type, select it in the office page's lessons query, and render it in `LessonPopover` when present.

### Changes Required:

#### 1. `LessonRow` type

**File**: `src/app/office/components/types.ts`

**Intent**: Extend `LessonRow` so the rejection reason flows through the same typed path as every other lesson field.

**Contract**: Add `rejection_reason: string | null` to the `LessonRow` type (matching the nullable `text` column).

#### 2. Office lessons query

**File**: `src/app/office/page.tsx`

**Intent**: Fetch the reason alongside the fields already selected, so it reaches `LessonPanel` → `LessonPopover` via the existing `lessons` prop chain.

**Contract**: Add `rejection_reason` to the `.select(...)` string at line 50 (`'id, scheduled_at, status, category, students(name)'` → include `rejection_reason`).

#### 3. Render the reason in the popover

**File**: `src/app/office/components/lesson-panel/LessonPopover.tsx`

**Intent**: Show the reason to office staff exactly where they already look for lesson status, using the existing `DetailRow` component.

**Contract**: Add a `DetailRow` with `label="Rejection reason"` rendered only when `lesson.status === 'rejected' && lesson.rejection_reason`, placed after the existing Status block (after line 104).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Full build succeeds (runs typecheck + lint): `npm run build`
- Existing test suite still passes: `npm test` (or `npx vitest run`)

#### Manual Verification:

- Reject a lesson end-to-end via `/lesson/[token]` with a typed reason, then open its popover in `/office` — the "Rejection reason" row appears with the correct text.
- Reject a lesson via `/lesson/[token]` leaving the reason blank — the popover shows no "Rejection reason" row.
- Open the popover for a `pending` and a `confirmed` lesson — no "Rejection reason" row appears in either case.
- Reject a lesson with a long (multi-paragraph) reason — confirm it wraps and scrolls within the existing panel without layout breakage.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None added (see What We're NOT Doing) — existing type-checking and lint gates cover the wiring correctness for this change.

### Manual Testing Steps:

1. Book a lesson as office, note its one-time link.
2. Open the link as the instructor, reject with a typed free-text reason.
3. Return to `/office`, open the lesson's popover, confirm the reason displays.
4. Repeat rejecting a different lesson with the reason field left blank; confirm the row is absent.
5. Spot-check a `pending` and a `confirmed` lesson's popover to confirm no regression (no unexpected row, no crash).

## Performance Considerations

None — one additional selected column on an already-scoped, indexed (`instructor_id`, `scheduled_at`) weekly query; negligible payload growth.

## Migration Notes

None — no schema change, `rejection_reason` already exists and is populated by the current reject flow.

## References

- Roadmap: `context/foundation/roadmap.md` TD-11
- GitHub issue: #51
- PRD: `context/foundation/prd.md:58`, FR-008
- Column origin: `supabase/migrations/20260614143835_initial_schema.sql:30`
- Write path: `supabase/migrations/20260705155520_scope_rejection_reason_to_rejected_decision.sql:28`, `src/app/actions/lessons/respondToLesson.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Surface rejection_reason in office UI

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — 13b3082
- [x] 1.2 Linting passes: `npm run lint` — 13b3082
- [x] 1.3 Full build succeeds: `npm run build` — 13b3082
- [x] 1.4 Existing test suite still passes: `npm test` — 13b3082

#### Manual

- [x] 1.5 Rejection with typed reason shows the "Rejection reason" row in the office popover — 13b3082
- [x] 1.6 Rejection with blank reason shows no "Rejection reason" row — 13b3082
- [x] 1.7 Pending/confirmed lessons show no "Rejection reason" row — 13b3082
- [x] 1.8 Long rejection reason wraps/scrolls without layout breakage — 13b3082
