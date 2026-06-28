<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Office Books Lesson (S-01)

- **Plan**: context/changes/office-books-lesson/plan.md
- **Scope**: Phase 5 of 6
- **Date**: 2026-06-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  3 warnings  4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — cancelLesson permits cancelling rejected lessons server-side

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/actions/lessons.ts:82
- **Detail**: Server action updates the row for any status including 'rejected'. UI hides Cancel for rejected lessons but server has no corresponding guard.
- **Fix**: Added `.in('status', ['pending', 'confirmed'])` before `.select()`.
- **Decision**: FIXED

### F2 — Double-submit race window in NewLessonForm

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/office/NewLessonForm.tsx:51
- **Detail**: `handleAction` did not guard on `isPending` — a fast double-click could enqueue two `createLesson` calls before the button disabled state rendered.
- **Fix**: Added `if (isPending) return` as the first line of `handleAction`.
- **Decision**: FIXED

### F3 — LessonBlock uses a <div> instead of <button>

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/office/LessonBlock.tsx:18
- **Detail**: Interactive element was a `<div onClick>` — not keyboard-reachable, no role or aria-label. InstructorSidebar uses `<button type="button">` throughout.
- **Fix**: Replaced with `<button type="button">` + `aria-label={studentName – category}`.
- **Decision**: FIXED

### F4 — Instructor type widened beyond plan contract (undocumented)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/app/office/LessonPanel.tsx:9, NewLessonForm.tsx:8
- **Detail**: Plan specified `instructor: { id, name }`. Implementation adds `categories: string[]` (for category dropdown) and passes instructor to LessonPopover (for display). Code is correct; plan didn't document the decision.
- **Fix**: Added addendum note to plan.md Phase 5 section.
- **Decision**: FIXED

### F5 — Students query missing soft-delete guard comment

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/office/page.tsx:59
- **Detail**: `lessons.ts` has a "when deactivated_at is added..." comment for instructor/student queries. New students query in `page.tsx` was missing the equivalent comment.
- **Fix**: Added matching comment above the students query.
- **Decision**: FIXED

### F6 — STATUS_LABELS/STATUS_COLORS have no 'cancelled' entry

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/office/LessonPopover.tsx:12
- **Detail**: `LessonRow.status` excludes 'cancelled' by design (filtered out in page.tsx), but no comment documented the assumption. A future filter relaxation would silently produce undefined.
- **Fix**: Added a one-line comment documenting the assumption above STATUS_LABELS.
- **Decision**: FIXED

### F7 — Slide-in drawer missing role="dialog" and aria-label

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/office/LessonPanel.tsx:58
- **Detail**: Drawer div had no ARIA role — announced as a plain div by screen readers.
- **Fix**: Added `role="dialog" aria-modal="true" aria-label={mode === 'create' ? 'New lesson' : 'Lesson details'}`.
- **Decision**: FIXED
