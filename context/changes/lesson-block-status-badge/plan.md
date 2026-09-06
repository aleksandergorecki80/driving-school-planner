# Lesson Block Status Badge Implementation Plan

## Overview

Add a compact status badge to `LessonBlock` — the calendar tile rendered per lesson in `CalendarGrid` — so status (pending/confirmed/rejected) is legible as text, not just border/background color. Closes roadmap TD-14 / GitHub issue #81.

## Current State Analysis

`LessonBlock.tsx` renders two lines inside a `Button`-styled tile: student name and category. Status is conveyed only via `LESSON_STATUS[lesson.status].chipClassName` (border/background color) applied to the tile itself — no text label. `LESSON_STATUS` (`src/components/lesson/lesson-status.ts`) already defines `label` and `badgeClassName` per status, both already consumed by the shadcn `Badge` component in `LessonPopover.tsx` (`<Badge className={status.badgeClassName}>{status.label}</Badge>`). No data model or `lesson-status.ts` changes are needed — this is purely a `LessonBlock.tsx` rendering change.

Tiles are always exactly 2 grid rows tall (`gridRow: slotIndex + 2 / slotIndex + 4`, each row `2rem` per `CalendarGrid.tsx`), i.e. a fixed 64px height regardless of lesson content — no variable-height edge case to handle. Day columns are 7×`1fr` of the grid's width, so column width shrinks on narrow viewports; the tile already truncates long student names/categories via the `truncate` class.

### Key Discoveries:

- `src/components/lesson/lesson-status.ts:6-31` — `LESSON_STATUS` record already has everything needed (`label`, `badgeClassName`); no changes required here.
- `src/app/office/components/lesson-panel/LessonPopover.tsx:103` — existing precedent for `<Badge className={status.badgeClassName}>{status.label}</Badge>`, to be adapted (shrunk) for the tile.
- `src/components/ui/badge.tsx:8` — default `Badge` variant is `h-5` with `px-2 py-0.5`, a pill sized for roomier UI than a 64px-tall/narrow tile; needs an overriding `className` to shrink it to fit as a third line.
- `src/app/office/components/calendar/CalendarGrid.tsx:141` — confirms fixed 2-row tile height; no per-lesson-duration variability to plan around.
- No existing test file for `LessonBlock` — `CalendarGrid.test.tsx` (`@vitest-environment jsdom`, `@testing-library/react`) is the established component-test pattern to follow for the new `LessonBlock.test.tsx`.

## Desired End State

Each lesson tile in the office calendar shows three lines: student name, category, and a compact status badge (reusing `LESSON_STATUS[status].label` and `.badgeClassName`), truncating via CSS ellipsis on narrow columns rather than wrapping or overflowing. The tile's `aria-label` includes the status text so screen-reader users get the same information sighted users now see from the badge. Verify by opening the office calendar and visually confirming the badge appears, is legible in both light/dark themes, and doesn't break tile layout at both desktop and narrow (mobile) widths.

## What We're NOT Doing

- No changes to `LESSON_STATUS` (`label`/`badgeClassName` already exist and are reused as-is).
- No abbreviated/short-form label variant — the tile truncates the full label with CSS ellipsis instead (per the narrow-column decision below).
- No changes to `LessonPopover.tsx`'s existing status badge — it already works and is out of scope.
- No changes to tile height, grid row span, or lesson duration logic.

## Implementation Approach

Add the badge as a third line below the category line, using the shadcn `Badge` component (consistent with `LessonPopover.tsx`) but with a shrunk `className` override so it fits the tile's existing compact `text-xs` sizing. Reuse the tile's existing `truncate` class on the badge's label so long status words (e.g. "Confirmed") ellipsize on narrow columns instead of wrapping or overflowing. Extend `aria-label` to append the status label.

## Phase 1: Add status badge to LessonBlock tile

### Overview

Render the status badge as a third line in `LessonBlock.tsx`, extend the tile's `aria-label`, and add a component test covering all three statuses plus the `aria-label` change.

### Changes Required:

#### 1. Status badge rendering + aria-label

**File**: `src/app/office/components/calendar/LessonBlock.tsx`

**Intent**: Surface `LESSON_STATUS[lesson.status].label` as a visible third line on the tile (reusing `badgeClassName`), and include that same label in the tile's `aria-label` so the accessibility gap (color-only status coding) is closed for both sighted and screen-reader users.

**Contract**: Add a `<Badge>` (import from `@/components/ui/badge`) inline on the same row as the category text — category on the left, badge pushed to the tile's right edge via a `flex justify-between` row — rather than as a separate third line, since a stacked third line left a large unused strip of horizontal space in the tile (found and corrected during manual verification, see screenshot in conversation). Pass `LESSON_STATUS[lesson.status].badgeClassName` plus an overriding `className` that shrinks the default `h-5`/`px-2 py-0.5` pill sizing down to something that fits a `text-xs`, 64px-tall tile (e.g. a smaller height, tighter horizontal padding, `text-[10px]` or similar) and adds `truncate` + a `max-w` cap so a long label ellipsizes instead of overflowing, while the category text also gets `min-w-0 truncate` so both sides degrade gracefully on a narrow column. Change `aria-label` from `` `${studentName} – ${lesson.category}` `` to `` `${studentName} – ${lesson.category} – ${LESSON_STATUS[lesson.status].label}` ``.

#### 2. Component test

**File**: `src/app/office/components/calendar/LessonBlock.test.tsx` (new)

**Intent**: Establish automated coverage that the badge renders the correct label per status and that `aria-label` includes it, following the existing `CalendarGrid.test.tsx` jsdom + Testing Library pattern (`@vitest-environment jsdom` pragma at the top of the file).

**Contract**: Render `LessonBlock` directly (not through `CalendarGrid`) with a minimal `LessonRow` fixture for each of `'pending' | 'confirmed' | 'rejected'`, and assert: the tile shows the expected status text (`getByText` on the label), and `aria-label` contains that same label alongside the existing student name and category.

## Testing Strategy

### Unit Tests:

- `LessonBlock.test.tsx`: for each of the 3 statuses, the badge text is present and `aria-label` includes the status label.

### Manual Testing Steps:

1. Open the office calendar with lessons in all three statuses (pending/confirmed/rejected) and confirm each tile shows its status label as a third line, legible in both light and dark theme.
2. Resize the browser to a narrow/mobile width and confirm long labels (e.g. "Confirmed") truncate with an ellipsis rather than wrapping or overflowing the tile.
3. Confirm the badge doesn't visually collide with or crowd out the student name / category lines at the tile's fixed 64px height.

## References

- Roadmap: `context/foundation/roadmap.md` TD-14
- Change notes: `context/changes/lesson-block-status-badge/change.md`
- Precedent: `src/app/office/components/lesson-panel/LessonPopover.tsx:103`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Add status badge to LessonBlock tile

#### Automated

- [x] 1.1 Type checking passes: `npm run build`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 New unit tests pass: `npm test -- LessonBlock` (badge text + aria-label per status)
- [x] 1.4 Existing tests still pass: `npm test -- CalendarGrid`

#### Manual

- [x] 1.5 Status badge visible and legible on tiles in both light and dark theme
- [x] 1.6 Long status labels truncate with ellipsis on a narrow/mobile viewport instead of wrapping or overflowing
- [x] 1.7 Badge doesn't visually crowd out student name / category at the tile's fixed 64px height
