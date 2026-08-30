<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Align UI with shadcn/ui blocks + wire up dark mode

- **Plan**: context/changes/shadcn-design-refresh/plan.md
- **Scope**: Phase 1 of 6 (full plan — all phases complete)
- **Date**: 2026-08-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation — both fixed during triage (2026-08-30)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Phase 3's header/SidebarInset markup landed in office/page.tsx, not office/layout.tsx as planned

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/shadcn-design-refresh/plan.md` (Phase 3 Contract) vs. actual `src/app/office/page.tsx:80-84`
- **Detail**: The plan's Phase 3 Contract assigns `SidebarInset` + `SidebarTrigger` + the sr-only `<h1>Office Dashboard</h1>` (closing the `seed.spec.ts` heading gap) to `src/app/office/layout.tsx`. In the actual implementation, `office/layout.tsx` is a 4-line file that only renders `<SidebarProvider>{children}</SidebarProvider>` — the header markup instead lives in `office/page.tsx`, which already fetches `instructorId`/`selectedInstructor`. Functionally equivalent (verified: `seed.spec.ts`'s heading assertion passes, `SidebarTrigger` renders correctly) — this is a plan-vs-file-location mismatch, not a functional gap. Moving the markup into `layout.tsx` as literally planned would force a duplicate Supabase fetch there, which is worse.
- **Fix**: Update Phase 3's Contract text in `plan.md` to say the header/SidebarInset markup lives in `office/page.tsx` (not `office/layout.tsx`), so the plan matches reality for future readers.
- **Decision**: FIXED — added an "As implemented (post-impl-review F1)" note to Phase 3's Contract in plan.md.

### F2 — ThemeToggle shows a brief icon flash on first paint for dark-mode users

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/components/theme-toggle.tsx` (whole file)
- **Detail**: `resolvedTheme` is `undefined` on the server and on the very first client render (before `next-themes`' mount effect resolves the real theme), so the toggle always paints `Moon` first, then flips to `Sun` a tick later for users whose OS/browser prefers dark. This does not produce a hydration-mismatch error (server and first client paint agree) — just a brief icon flash. Standard, well-known `next-themes` behavior.
- **Fix**: Optional polish only — add a `mounted` guard (render `null`/a neutral icon until mount) if the flash is undesirable. No action required; not a correctness bug.
- **Decision**: FIXED — added an `isHydrated` guard via `useSyncExternalStore` (not a `useEffect`+`setState`, which would retrigger the `react-hooks/set-state-in-effect` lint error this component was originally simplified to avoid); verified via lint/typecheck/build and a dark-mode screenshot that the Sun icon still resolves correctly post-hydration.

## Sub-agent notes (not separate findings, recorded for completeness)

- **Plan drift agent**: all Phase 1, 2, 4, 5, 6 Changes Required items verified as exact MATCH against actual file content (Intent + Contract). All "What We're NOT Doing" guardrails respected — no `react-hook-form`/`zod` adopted, rejection reason still not displayed in office UI, `Popover` deleted not reintroduced, `skeleton.tsx`/`tooltip.tsx`/`sheet.tsx` (transitive CLI deps of the `sidebar` block) have zero imports outside `sidebar.tsx` itself, `CalendarGrid.tsx` grid-layout math untouched, `LessonResponseForm`'s two-step flow structurally untouched. `office/page.test.ts`'s status-color assertion update is a documented, justified fix (Phase 4 Progress log), not scope creep.
- **Safety/quality/pattern agent**: no CRITICAL or WARNING findings. Specifically verified: `src/proxy.ts`'s new `/` redirect branch cannot bypass or precede the existing `/office` auth gate (git diff shows only the new branch added, positioned after the gate check). The `container` prop added to `select.tsx`/`alert-dialog.tsx` (vaul/Base-UI portal workaround) is correctly typed/forwarded and preserves default behavior for callers that omit it (verified against `node_modules/@base-ui/react/floating-ui-react` source). `src/hooks/use-mobile.ts`'s hand-rewrite onto `useSyncExternalStore` is correct and genuinely fixes the original `react-hooks/set-state-in-effect` lint error rather than suppressing it. No `FormEvent`/`onSubmit` reintroduced, no raw HTML interactive elements reintroduced, no non-null assertions, no unnecessary `'use client'` boundaries. No substantive pattern mismatches between sibling files.
- **Success criteria**: `npm run build`/`lint`/`typecheck`/`test` (66/66) all exit 0 on the final tree. `e2e/seed.spec.ts` passes. `e2e/office-books-lesson.spec.ts` passes on a clean DB (confirmed in a fresh run during this review) — the plan's own documented ~20-30% intermittent failure rate (roadmap `TD-05`, a known vaul-Drawer/Base-UI portal race) was also reproduced once during this review's verification pass, consistent with the plan's own accepted-risk documentation, not a new regression.
