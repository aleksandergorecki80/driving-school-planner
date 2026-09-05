# Office Rejection Reason Display — Plan Brief

> Full plan: `context/changes/office-rejection-reason-display/plan.md`

## What & Why

Show the already-persisted `lessons.rejection_reason` in the office lesson detail popover. It's written correctly by the reject flow but never read back or displayed anywhere on the office side — a confirmed unmet must-have from the PRD (FR-008: "the office sees the reason alongside the status change"), tracked as roadmap TD-11 / GitHub issue #51.

## Starting Point

`LessonRow`, the office lessons query, and `LessonPopover.tsx` all omit `rejection_reason` — the field exists in the database and is correctly written by the `respond_to_lesson` RPC, but three layers (type, query, render) simply never carry it through. Confirmed unchanged since the issue was filed in July.

## Desired End State

Office staff open a rejected lesson's popover and see a "Rejection reason" row with the instructor's free-text reason, right below the Status badge. No row appears for lessons that are pending, confirmed, or rejected-with-no-reason-given.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Display surface | Popover only, not calendar grid | FR-008 only requires the reason alongside the status change, which the popover already covers; grid/tooltip would be new UI surface beyond the confirmed issue | Plan |
| Test coverage | No new test file | Pure rendering addition on an existing conditional; matches project convention of not test-covering low-blast-radius static UI (test-plan.md §7) | Plan |
| Long-text handling | No truncation — natural wrap | Column has no length cap and the panel is already scrollable; no other field in this panel truncates | Plan |
| Phase structure | Single phase | Type → query → render is one tightly-coupled field threading through the stack; splitting would be artificial | Plan |

## Scope

**In scope:**
- Add `rejection_reason: string | null` to `LessonRow`
- Select it in the office page's lessons query
- Render it via `DetailRow` in `LessonPopover` when `status === 'rejected'` and a reason is present

**Out of scope:**
- Tooltip/hover text on `CalendarGrid`/`LessonBlock`
- New test file for `LessonPopover`
- Any change to the reject/write path (RPC, form, AI-suggested reasons)
- Truncation or "show more" UI

## Architecture / Approach

Thread one field through the existing three-layer path every other lesson field already follows: DB column → `LessonRow` type → office page `.select()` → `LessonPopover` render via the existing `DetailRow` component. No new components, no schema change.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Surface rejection_reason in office UI | Type + query + render wired end-to-end | None significant — additive, typed, no schema change |

**Prerequisites:** None — S-02 (instructor-responds) already shipped the write path.
**Estimated effort:** Single short session, one phase.

## Open Risks & Assumptions

- None outstanding — scope, data shape, and edge cases were confirmed via direct codebase inspection before planning (no schema ambiguity, no format ambiguity in the reason text).

## Success Criteria (Summary)

- A rejected lesson with a typed reason shows that reason in the office popover.
- A rejected lesson with no reason, or any non-rejected lesson, shows no such row.
- `npm run build` (typecheck + lint) and the existing test suite pass unchanged.
