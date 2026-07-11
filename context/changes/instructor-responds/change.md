---
change_id: instructor-responds
title: Instructor responds to a lesson via one-time per-lesson email link (S-02 rework)
status: implemented
created: 2026-07-04
updated: 2026-07-11
archived_at: null
---

## Notes

Implements roadmap slice S-02 with a reworked access model: replaces the originally-proposed
permanent per-instructor URL token (list view) with a one-time token scoped to a single lesson,
delivered by email, invalidated on decision/cancellation/regeneration. Adds AI-suggested
rejection reasons (FR-012). FR-013 was reworked mid-implementation (2026-07-11): rather than an
office-editable `instructors.email` field, the office can send a lesson-link email to a one-shot
override address (at creation or resend) without ever overwriting or persisting anything to
`instructors.email`.

**Known gap (found during Phase 9 docs sync, 2026-07-11):** rejection reasons are correctly
persisted (tested since Phase 3) but are never displayed anywhere in the office UI — `LessonRow`,
`office/page.tsx`'s query, and `LessonPopover.tsx` all omit `rejection_reason`. Not blocking this
change's "implemented" status since the core approve/reject/poll loop works, but tracked as
outstanding follow-up work — see `context/foundation/test-plan.md` §3 and `roadmap.md`'s S-02
entry.

Upstream artifacts:
- `context/foundation/shape-notes.md` (brownfield shaping session)
- `context/foundation/prd-v2.md` (brownfield delta PRD — the source of truth for scope)
- `context/foundation/stack-assessment.md`, `context/foundation/health-check.md`

Corrects a PRD assumption: `instructors.token` / `get_instructor_lessons()` are NOT dead code —
they're live and tested (`src/lib/supabase/rls.test.ts`, `src/app/instructor/[token]/page.tsx`).
This plan's Phase 2 retires them deliberately as part of the cutover, not as a no-op cleanup.
