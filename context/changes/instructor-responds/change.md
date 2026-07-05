---
change_id: instructor-responds
title: Instructor responds to a lesson via one-time per-lesson email link (S-02 rework)
status: impl_reviewed
created: 2026-07-04
updated: 2026-07-05
archived_at: null
---

## Notes

Implements roadmap slice S-02 with a reworked access model: replaces the originally-proposed
permanent per-instructor URL token (list view) with a one-time token scoped to a single lesson,
delivered by email, invalidated on decision/cancellation/regeneration. Adds AI-suggested
rejection reasons (FR-012) and an office-editable instructor email field (FR-013).

Upstream artifacts:
- `context/foundation/shape-notes.md` (brownfield shaping session)
- `context/foundation/prd-v2.md` (brownfield delta PRD — the source of truth for scope)
- `context/foundation/stack-assessment.md`, `context/foundation/health-check.md`

Corrects a PRD assumption: `instructors.token` / `get_instructor_lessons()` are NOT dead code —
they're live and tested (`src/lib/supabase/rls.test.ts`, `src/app/instructor/[token]/page.tsx`).
This plan's Phase 2 retires them deliberately as part of the cutover, not as a no-op cleanup.
