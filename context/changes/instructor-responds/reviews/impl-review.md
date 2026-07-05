<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Instructor Responds (S-02 rework)

- **Plan**: context/changes/instructor-responds/plan.md
- **Scope**: Phases 1-5 of 8 (Phase 5 hotfix included)
- **Date**: 2026-07-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Grounding

Two parallel sub-agents (plan-drift detection, safety/quality/pattern compliance) independently read all 5 migrations, all 4 server action files + barrel, anon.ts, sendLessonLink.ts, the /lesson/[token] page + form, test-client.ts, and lesson-token.test.ts, cross-referenced against plan.md and lessons.md, plus baseline comparison files (service.ts, server.ts, LessonPopover.tsx, button.tsx). Full test suite (36 tests), build, lint, and typecheck all re-verified green on HEAD. All "What We're NOT Doing" boundaries checked — no violations, no Phase 6/7 code leaked early.

## Findings

### F1 — anon.ts's module-level throw guard is transitively pulled into the barrel, reproducing the incident pattern

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / Pattern Consistency
- **Location**: src/lib/supabase/anon.ts:6-10, src/app/actions/lessons/respondToLesson.ts:2
- **Detail**: lessons.md's carve-out says module-level throw-on-missing-env is fine for "files that are never barreled — e.g. `service.ts`, `anon.ts`". But `respondToLesson.ts` (a sibling re-exported by `index.ts`) imports `createAnonClient` from `anon.ts` at module scope, and `anon.ts` throws at module scope if `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing. This is the exact mechanism that caused the 2026-07-05 production incident, just with a different pair of env vars. Practical risk is muted today because these vars are core dependencies already required unguarded elsewhere (`server.ts`), so most environments that would trip this are already broken app-wide — but the carve-out's premise ("anon.ts is never barreled") is no longer true now that one of its consumers sits behind a barrel.
- **Fix A ⭐ Recommended**: Move the guard inside `createAnonClient()`'s body, mirroring the fix already applied to `sendLessonLink.ts`.
  - Strength: Closes the pattern gap completely; consistent with the just-established lessons.md rule and its stated fix.
  - Tradeoff: One more function loses the "fail fast and loud at boot" property for a genuinely-required var — acceptable since `server.ts` already fails the same way elsewhere if these vars are missing.
  - Confidence: HIGH — identical fix already proven in this same incident.
  - Blind spot: None significant.
- **Fix B**: Leave the code as-is; instead correct lessons.md's wording to say the module-level-throw exception requires the file to never be imported, even transitively, by anything behind a barrel — and accept the current state as low-risk since these vars are core.
  - Strength: No code change; documentation-only.
  - Tradeoff: Leaves a real (if muted) landmine in place — the next added anon.ts-dependent env var won't be so forgiving.
  - Confidence: MEDIUM — depends on no future anon.ts additions being barrel-reachable-only-failure-prone vars.
  - Blind spot: Haven't audited whether any other barrel-reachable file has a similar transitive import.
- **Decision**: FIXED via Fix A

### F2 — respond_to_lesson doesn't scope rejection_reason to the 'rejected' decision

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260704213336_lesson_token_functions.sql:39-41
- **Detail**: `UPDATE lessons SET status = p_decision::lesson_status, rejection_reason = p_reason, ...` sets `rejection_reason` unconditionally from `p_reason`, even when `p_decision = 'confirmed'`. The app's UI never sends a reason on confirm, but `respond_to_lesson` is `GRANT EXECUTE ... TO anon` — directly callable by anyone holding a valid token, bypassing the app entirely. A confirmed lesson could end up with a stray `rejection_reason`, a state the domain model shouldn't allow and that a future office UI trusting "rejection_reason implies rejected" would misread.
- **Fix**: New migration: `rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_reason ELSE NULL END`.
- **Decision**: FIXED — migration 20260705155520, regression test added to lesson-token.test.ts

### F3 — Three lessons.md rules were confirmed "merged" but never actually reached main

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/foundation/lessons.md (current HEAD)
- **Detail**: During this session, three lessons were drafted and the user confirmed "gotowe zmergowane": "Every commit goes on its own branch, followed by a merge request" (commit 3d6ace5), "Always use shadcn/ui components when building UI" and "Update roadmap.md and the GitHub board after finishing work" (commit b7bff36). Root cause: I described four branches as a linear dependency chain when two were actually siblings off the same parent (`docs/lessons-shadcn-and-roadmap-sync-v2` and `refactor/lessons-actions-split` both branched from `feat/instructor-responds-p4` independently). When the last branch in the chain was squash-merged (PR #34), only its true ancestry (`feat/instructor-responds-p4` → `refactor/lessons-actions-split` → `docs/lesson-one-server-action-per-file`) was included — `docs/lessons-shadcn-and-roadmap-sync-v2`'s commit was never merged. `docs/lesson-branch-per-commit` and `docs/lessons-shadcn-and-roadmap-sync-v2` exist only as local branches with no remote counterpart (confirmed via `git branch -a`). Verified: current `context/foundation/lessons.md` on HEAD has only 6 entries (FormEvent, FK ON DELETE, no-`!`, soft-delete, one-server-action-per-file, env-var-guards-lazy) — missing all three. A fresh session with no personal memory of this conversation would not know to follow the branch-per-commit, shadcn-first, or roadmap/board-sync rules.
- **Fix**: Re-commit the three missing lessons.md entries on a fresh branch off current main (content already drafted, just needs correct re-application), then verify `git merge-base --is-ancestor <sha> origin/main` before telling the user it's merged, rather than trusting "gotowe zmergowane" alone when the branch topology was non-linear.
- **Decision**: PENDING

### F4 — plan.md's Phase 6/7 "File:" fields still point at the deleted single-file lessons.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/instructor-responds/plan.md lines 578, 588 (Phase 6), Phase 7's actions file reference, and the References section (lines 763-764)
- **Detail**: `src/app/actions/lessons.ts` was split into `src/app/actions/lessons/*.ts` during the Phase 4→5 refactor (commit f1df1bd), documented as a new "one server action per file" rule. The refactor commit updated Progress-table SHAs and added a Phase 4 item 0, but never updated the still-upcoming Phase 6/7 "File:" fields or the References section, which still say `src/app/actions/lessons.ts` — a file that no longer exists. The next implementer (Phase 6, not yet started) would look in the wrong place for `respondToLesson` and for where to add `suggestRejectionReasonsAction`.
- **Fix**: Update the "File:" fields in Phase 6 and Phase 7 plus the References section to point at the correct files under `src/app/actions/lessons/`.
- **Decision**: PENDING

### F5 — Raw Postgres error message surfaced to the anonymous instructor page

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/app/actions/lessons/respondToLesson.ts:17-19
- **Detail**: `if (error) { return { error: error.message } }` forwards the raw Supabase/Postgres error string straight to `LessonResponseForm`'s error display. Unlike `createLesson`/`cancelLesson` (authenticated office context), this action is reachable by anyone with a URL, so leaking internal error text is a minor info-disclosure surface.
- **Fix**: Map unexpected DB errors to a generic message for this anon-facing action; keep the DB message server-side only.
- **Decision**: PENDING

### F6 — Duplicated instructor-notification wiring between createLesson.ts and regenerateLessonToken.ts

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/app/actions/lessons/createLesson.ts:97-110, src/app/actions/lessons/regenerateLessonToken.ts:36-50
- **Detail**: Both files independently repeat the same sequence — check instructor email → check app URL → build link → call sendLessonLink → map error to warning.
- **Fix**: Extract a shared `notifyInstructorOfLessonLink()` helper in src/lib/email/ and call it from both.
- **Decision**: PENDING

### F7 — Column/function drop has no rollback path

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260705102934_drop_instructor_token.sql
- **Detail**: Irreversible drop, no down-migration — consistent with this repo's existing forward-only migration convention (no other migration has one either), and verified provably safe (no remaining code references). Flagging only because it's permanent.
- **Fix**: None required — matches existing project convention. Note only.
- **Decision**: PENDING

### F8 — createLesson.ts's insert selects only 'token', not 'id, token' as the plan's literal contract specifies

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: src/app/actions/lessons/createLesson.ts:90
- **Detail**: Harmless today since `id` is never used downstream, but a literal deviation from the plan's Phase 5 contract text.
- **Fix**: Either add `id` back for contract fidelity, or annotate the plan to reflect the simplification.
- **Decision**: PENDING

### F9 — seedInstructor() gained an undocumented email field

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: src/lib/supabase/test-client.ts
- **Detail**: Phase 2's literal contract said `.select('id, name, categories')`; actual is `'id, name, categories, email'`, needed by Phase 5's tests but never called out in the plan as an intentional extension.
- **Fix**: None required — reasonable evolution. Note only for future readers of Phase 2's section.
- **Decision**: PENDING

### F10 — Progress-section commit SHAs for Phases 1-4 are unreachable in main (squash-merge artifact)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria
- **Location**: context/changes/instructor-responds/plan.md Progress section, Phases 1-4
- **Detail**: `git merge-base --is-ancestor` confirms none of 6762ccd/80a9c6a/df6f2fc/17f2c3b are reachable from origin/main — GitHub's squash-merge always produces a new hash. Only Phase 5's abd59f5 happens to be traceable (single-commit PR). This makes the recorded SHAs decorative rather than reliably traceable under this repo's squash-merge workflow.
- **Fix**: None required for this change — informational. Worth considering recording PR numbers instead of local pre-merge SHAs in future `/10x-tdd` runs, since PR numbers survive squash-merges.
- **Decision**: PENDING
