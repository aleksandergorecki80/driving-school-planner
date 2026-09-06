# Lesson Block Status Badge — Plan Brief

> Full plan: `context/changes/lesson-block-status-badge/plan.md`

## What & Why

Lesson tiles in the office calendar (`LessonBlock.tsx`) currently show status only via border/background color — no text label. This is a color-only accessibility gap: new users have no way to learn the color mapping without opening the popover, and screen-reader users can't perceive status at all from the tile. We're adding a compact status badge (reusing the existing `LESSON_STATUS.label`) as a third line on the tile.

## Starting Point

`LESSON_STATUS` (`src/components/lesson/lesson-status.ts`) already defines `label` and `badgeClassName` per status, both already used by the shadcn `Badge` component in `LessonPopover.tsx`. No data model work — this is a pure `LessonBlock.tsx` rendering change, reusing an established pattern.

## Desired End State

Each tile shows student name, category, and a compact status badge — legible in both themes, truncating on narrow columns instead of overflowing. The tile's `aria-label` also includes the status so screen readers get the same information.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Visual style | shadcn `Badge` pill (shrunk) | Reuses the exact component/pattern already proven in `LessonPopover.tsx`, just resized to fit the tile. |
| Placement | Inline with category, right-aligned | Corrected mid-implementation: a stacked third line left a large unused strip of horizontal space in the tile (found via manual screenshot review); putting the badge on the category's row and pushing it right uses that space instead. |
| Narrow columns | Truncate with CSS ellipsis | Reuses the tile's existing `truncate` handling for long names/categories — no new abbreviation logic to maintain. |
| Accessibility | Append status to `aria-label` | Matches the accessibility motivation behind the whole change — screen-reader users get status too, not just sighted users. |

## Scope

**In scope:**
- `LessonBlock.tsx`: render badge, shrink its sizing to fit the tile, extend `aria-label`
- New `LessonBlock.test.tsx` covering all 3 statuses + the `aria-label` change

**Out of scope:**
- `LESSON_STATUS` data (`label`/`badgeClassName` unchanged, reused as-is)
- Abbreviated/short-form labels — full label truncates instead
- `LessonPopover.tsx`'s existing status badge (already works)
- Tile height / grid row span / lesson duration logic

## Architecture / Approach

Single-file change: `LessonBlock.tsx` gains a third `<Badge>` line reusing `LESSON_STATUS[lesson.status].badgeClassName`, sized down from the shadcn default to fit a `text-xs`, 64px-tall tile, with `truncate` so long labels ellipsize on narrow day columns. `aria-label` gets the status appended.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Add status badge to LessonBlock tile | Badge renders + aria-label updated + test coverage | Shrunk badge sizing might still visually crowd the tile at its narrowest — confirmed via manual check in Phase 1 |

**Prerequisites:** None — single self-contained file change.
**Estimated effort:** ~1 short session, 1 phase.

## Open Risks & Assumptions

- Assumes no existing test asserts the current 2-line-only tile content or the old `aria-label` string — confirmed: `CalendarGrid.test.tsx` doesn't check `LessonBlock`'s internal content, only slot-level `aria-label`s.

## Success Criteria (Summary)

- All three lesson statuses show a legible text label on the calendar tile, not just color.
- Screen readers can perceive lesson status from the tile's `aria-label` alone.
- No layout regression at narrow (mobile) viewport widths.
