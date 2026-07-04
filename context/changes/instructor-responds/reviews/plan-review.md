<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Instructor Responds (S-02 rework)

- **Plan**: context/changes/instructor-responds/plan.md
- **Mode**: Deep
- **Date**: 2026-07-04
- **Verdict**: REVISE
- **Findings**: 2 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

12/12 paths ✓, 7/7 symbols ✓, brief↔plan ✓

## Findings

### F1 — Phase 2 drops a column that a shared test fixture still selects

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Retire the old instructor-token mechanism
- **Detail**: `src/lib/supabase/test-client.ts`'s `seedInstructor()` selects `'id, token, name, categories'` (test-client.ts:41). Every integration test file (present and future, across all phases) calls this helper. Phase 2's migration drops `instructors.token`, but Phase 2's "Changes Required" doesn't touch `test-client.ts` — once the column is gone, `seedInstructor()` fails at the DB level for every test in the suite.
- **Fix**: Add a line item to Phase 2 — update `seedInstructor()` to select `'id, name, categories'` (drop `token`) and narrow its return type accordingly. Broaden Phase 2's automated-verification bullet to also check for no remaining reference to `instructors.token`.
- **Decision**: FIXED

### F2 — createLesson's insert never returns the token Phase 5 needs to email

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 5 — Email integration (Resend), item 3
- **Detail**: `createLesson`'s insert (`lessons.ts:80-86`) is a bare `.insert({...})` with no `.select()`. Phase 5's own success criteria require calling `sendLessonLink` with "a well-formed `/lesson/<token>` URL," but no phase adds a way to read the DB-generated token back after insert. `regenerateLessonToken` (Phase 3) explicitly returns its new token for exactly this reason — the same need applies to `createLesson` but isn't carried through.
- **Fix**: Change `createLesson`'s insert to `.insert({...}).select('id, token').single()`, mirroring `cancelLesson`/`regenerateLessonToken`'s existing `.select(...).single()` pattern, and use the returned token to build `lessonLinkUrl`.
- **Decision**: FIXED

### F3 — Phase 7's email field has no data path and no UI pattern to follow

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 7 — Office UI, item 2
- **Detail**: `src/app/office/page.tsx:36` selects `'id, name, categories'` (no `email`) and `InstructorSidebar`'s `Instructor` interface doesn't declare `email` either; `office/page.tsx` isn't in Phase 7's touched-files list. Separately, no existing office-side UI pattern covers an inline-editable text field (only a destructive-button pattern exists).
- **Fix**: Add to Phase 7: extend `office/page.tsx`'s query to include `email` and pass it through; add `email: string | null` to the `Instructor` interface; specify the edit mechanic as one `<form action={updateInstructorEmail}>` per row, per `lessons.md`'s no-`FormEvent` rule, mirroring Phase 4's form pattern.
- **Decision**: FIXED

### F4 — Malformed token in the URL may crash instead of showing "link invalid"

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — Instructor page at /lesson/[token]
- **Detail**: `get_lesson_by_token(p_token uuid)` rejects a non-UUID input with a Postgres/PostgREST error, not an empty result. The old page accidentally handled this by destructuring only `data` and ignoring `error`. Phase 4's contract doesn't say to replicate that.
- **Fix**: Add a line to Phase 4's page contract: treat any `get_lesson_by_token` error (not just null/empty data) as the "link is no longer valid" state.
- **Decision**: FIXED

### F5 — AI suggestion "server action wrapper" isn't a named file

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 6 — AI-suggested rejection reasons, item 3
- **Detail**: `LessonResponseForm.tsx` is a client component; reaching server-only AI Gateway config requires a server action, but Phase 6 only names `src/lib/ai/suggestRejectionReasons.ts` — the wrapper itself is unnamed.
- **Fix**: Name the wrapper explicitly — e.g. `suggestRejectionReasonsAction` in `src/app/actions/lessons.ts` (or a new `src/app/actions/ai.ts`).
- **Decision**: FIXED
