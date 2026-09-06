<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Past Lesson Timezone Check Implementation Plan

- **Plan**: context/changes/past-lesson-timezone-check/plan.md
- **Scope**: Phase 1 of 4, Phase 2 of 4, Phase 3 of 4, Phase 4 of 4 (full plan)
- **Date**: 2026-09-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `office-time.test.ts` doesn't cover the midnight `hourCycle` boundary

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `src/lib/office-time.test.ts`
- **Detail**: The code correctly guards against a known real `Intl.DateTimeFormat` quirk (some configurations render midnight as `"24:00"` instead of `"00:00"`, which would parse as `Number("24")` and silently roll to the wrong day) by using `hourCycle: 'h23'` (`office-time.ts:31`) — verified correct in Node. But the test suite only covers two midday instants (winter/summer); there's no regression test locking in the midnight-boundary behavior the `hourCycle: 'h23'` option exists specifically to guarantee.
- **Fix**: Add a test case in `office-time.test.ts` with a reference instant that is exactly Warsaw local midnight, asserting the resulting UTC-getter hour is `0` (not `24`) and the day hasn't silently rolled forward.
- **Decision**: FIXED — added the midnight-boundary test case (`2026-01-14T23:00:00.000Z` → Warsaw midnight `2026-01-15T00:00:00.000Z`, asserting `getUTCHours() === 0` and `getUTCDate() === 15`). Passes.

### F2 — New `book-lesson.test.ts` regression test has a low-probability timing flake risk

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/supabase/book-lesson.test.ts:141-162`
- **Detail**: The new test computes `scheduled_at` as `officeNowAsNaiveUTC() - 5 minutes` client-side, then the real hosted Supabase RPC evaluates `now()` server-side at call time. If network latency plus client/server clock skew together ever exceeded the 5-minute buffer, the test could flake (expecting `SCHEDULED_AT_IN_PAST` but getting `ok: true`). In practice a 5-minute buffer is generous against normal RPC latency and NTP-synced clock drift — low probability, not a real defect.
- **Fix**: Optional — widen the buffer (e.g., 30 minutes instead of 5) for extra margin, since the test only needs the value to be *some* amount before the office's current wall clock, not exactly 5 minutes.
- **Decision**: FIXED — widened the buffer from 5 to 30 minutes. Still safely within the "true UTC future" requirement (Warsaw's minimum offset is +1h in winter, so 30 min leaves margin in both seasons). Passes.

## Notes (non-findings, investigated and cleared)

- **SQL migration correctness**: Diffed the new migration against its immediate predecessor line-by-line — the *only* functional change is the past-check condition (`now()` → `AT TIME ZONE`-based comparison); every other clause (category checks, exception handling, `GRANT`) is byte-identical. No dropped checks, no permission changes.
- **TS/SQL timezone equivalence**: Both sides convert a true UTC instant → Warsaw wall-clock reading (never the reverse, ambiguous direction), so DST spring-forward/fall-back boundaries can't cause TS/SQL disagreement.
- **tzdata version drift** (Node/ICU vs. Postgres/OS) is a real but very unlikely and non-actionable dependency — noted for awareness, not a fix.
- **Non-null assertions**: none found in any of the 8 changed/new files (project's no-`!` rule respected).
- **Mock leakage**: `vi.restoreAllMocks()` correctly scoped in both `CalendarGrid.test.tsx` and `Lesson.test.ts`; Vitest's default per-file module isolation additionally prevents cross-file leakage.
- **Performance**: `officeNowAsNaiveUTC()` is called once per `CalendarGrid` render (hoisted before the per-slot loop), not once per rendered cell (confirmed — the implementation improved on the plan's literal "replace at line 79" wording by hoisting it, a beneficial deviation, not drift).
- **Pattern compliance**: `office-time.ts` matches `format-lesson-datetime.ts`'s module conventions; the new migration's header comment follows the same rationale-block convention as recent migrations, with an added maintenance note (coupling to `OFFICE_TIMEZONE`) in the same spirit.
