---
change_id: office-rejection-reason-display
title: Show the persisted rejection reason in the office UI
status: implemented
created: 2026-09-05
updated: 2026-09-05
archived_at: null
---

## Notes

TD-11 in roadmap.md. GitHub issue #51 (open). Confirmed unmet must-have
(prd.md:58, FR-008) — `lessons.rejection_reason` is persisted correctly but
never rendered. Fix shape confirmed via inspection 2026-09-05, still accurate:

- `src/app/office/components/types.ts` — `LessonRow` has no `rejection_reason` field
- `src/app/office/page.tsx:50` — lessons `.select(...)` doesn't include it
- `src/app/office/components/lesson-panel/LessonPopover.tsx` — has a
  `lesson.status !== 'rejected'` branch (line 132); the rejected-status
  counterpart is where the reason should render

Scope confirmed small enough to skip /10x-research; go straight to /10x-plan.
