---
date: 2026-08-10T16:14:00+0000
researcher: Claude Sonnet 5
git_commit: 38eece9d7bd134f101cd3243a05af11a91178692
branch: main
repository: driving-school-planner
topic: "Align UI with shadcn/ui blocks + wire up dark mode"
tags: [research, codebase, design-system, shadcn, dark-mode, tailwind]
status: complete
last_updated: 2026-08-10
last_updated_by: Claude Sonnet 5
---

# Research: Align UI with shadcn/ui blocks + wire up dark mode

**Date**: 2026-08-10T16:14:00+0000
**Researcher**: Claude Sonnet 5
**Git Commit**: 38eece9d7bd134f101cd3243a05af11a91178692
**Branch**: main
**Repository**: driving-school-planner

## Research Question

"Czy może design wyglądać lepiej — układ jest OK ale komponenty nie przypominają tego co oferuje https://ui.shadcn.com/blocks, no i powinien być dark mode."
(Can the design look better — layout is fine but components don't resemble shadcn/ui blocks, and there should be dark mode.)

Scope confirmed with user: audit **all** real screens (`/office`, `/login`, `/lesson/[token]`), and produce **concrete block/component recommendations**, not just a state-of-the-world audit.

## Summary

**shadcn/ui is already installed and configured correctly** (`components.json`, style `base-nova`, `cssVariables: true`) — but only **6 of the 67 available primitives** are actually pulled in (`badge`, `button`, `drawer`, `popover`, `select`, `textarea`), and **3 of those 6 are installed but never imported anywhere** (`badge`, `drawer`, `popover`). Every real screen is built mostly from raw `<div>`/Tailwind-utility soup, hand-rolling exactly the things shadcn primitives (and the two flagship blocks currently on ui.shadcn.com — `dashboard-01`, `login-03`/`login-04`) already solve: cards, drawers, popovers, badges, form inputs, confirmation dialogs. The single biggest gap is `CalendarGrid.tsx` — a fully custom CSS-grid time-grid — but that's a legitimate custom component (shadcn/ui has no time-grid calendar block), not a hand-rolled reimplementation of something already installed.

**Dark mode: the token layer is 100% complete and correct** — `globals.css` defines full matching `:root`/`.dark` pairs for all 28 color tokens, correctly piped through `@theme inline`. What's entirely missing is the **toggle mechanism**: no `next-themes` dependency, no `ThemeProvider`, no toggle UI, no `suppressHydrationWarning`, and the `dark:` variant is class-based (`.dark *`), not media-query-based — so a provider/class-toggle is required, a CSS-only fix won't work.

Neither shadcn adoption depth nor dark mode has ever been discussed in `context/changes/**` or `context/archive/**`, with one exception: a "**always use shadcn/ui components when building UI**" rule was flagged as lost during a branch-merge mixup and marked `PENDING` re-application into `context/foundation/lessons.md` — but it was never actually added there (confirmed: not present in the current `lessons.md`). This research re-surfaces that gap.

## Detailed Findings

### What ui.shadcn.com/blocks actually offers today (2026-08)

Live-checked against the current site (not training-data recollection, which tends to over-list categories from the older shadcn example app):

- **Dashboard** — `dashboard-01`: sidebar nav + KPI cards + interactive area chart + data table.
- **Sidebar** — two variants: `sidebar-03` (collapses to icons), `sidebar-07` (nested submenus).
- **Login** — two variants: `login-03` (centered card, muted background), `login-04` (two-column form+image).
- A separate `/charts` section exists but is out of scope here (no chart needs in this app today).

There is **no dedicated calendar block, approve/reject workflow block, or token-verification block** on the page — confirming that `CalendarGrid.tsx`'s custom time-grid and `LessonResponseForm.tsx`'s confirm-flow are *legitimately* custom-built, not gaps against a block that already exists. The realistic shadcn wins for this app are at the **primitive** level (Card, Badge, Drawer, Popover, Input, Label, Dialog/AlertDialog, Checkbox) plus the **login block** for `/login`, not at the "adopt this whole flagship block" level — `/office` doesn't map cleanly onto `dashboard-01` (no charts, no data table — it's a calendar+sidebar app) but the *sidebar* portion of that pattern (`sidebar-03`/`sidebar-07`) is a close structural match for `InstructorSidebar.tsx`.

### Installed vs. used shadcn primitives

- `src/components/ui/`: `badge.tsx` (52 lines), `button.tsx` (58), `drawer.tsx` (134), `popover.tsx` (90), `select.tsx` (201), `textarea.tsx` (18) — 6 files, 553 lines.
- **Actually imported anywhere in app code**: only `button.tsx`, `select.tsx`, `textarea.tsx`.
- **Installed but dead** (zero imports): `badge.tsx`, `drawer.tsx`, `popover.tsx` — and ironically, the file *named* `LessonPopover.tsx` (`src/app/office/components/lesson-panel/LessonPopover.tsx`) does not use the installed `Popover`, and `LessonPanel.tsx`'s slide-in panel does not use the installed `Drawer` despite reimplementing exactly what it does.
- **No icon library** in use anywhere (`components.json` declares `iconLibrary: "lucide"`, but nothing imports from `lucide-react`) — unicode glyphs (`✕`, `←`, `→`) stand in for icons throughout.
- Scale: 161 `className=` occurrences across `src/app`/`src/components`; 10 files are `'use client'`.

### Screen-by-screen gap (file:line references)

**`/` (Home) — `src/app/page.tsx`**
Untouched `create-next-app` boilerplate (Vercel logo, "Deploy Now" links). Not a real product screen — out of scope for the redesign, should probably be replaced with a redirect to `/login` or `/office` rather than "improved."

**`/login` — `src/app/login/page.tsx` + `LoginForm.tsx`**
- `page.tsx:17` — hand-rolled Card: `<div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">` → should be `<Card><CardHeader><CardTitle>`.
- `LoginForm.tsx` (55 lines, client) — **zero shadcn primitives** despite `Button` already being installed and used elsewhere in the app: raw `<input type="text">`/`<input type="password">` (lines 16-23, 30-36), raw `<button>` (lines 45-51), raw `<p role="alert">` error text (line 40).
- This is the single most "un-shadcn'd" screen — every element that has an installed or easily-installed equivalent is hand-rolled. It also structurally matches `login-03` (centered card, muted background) almost exactly.

**`/office` — `src/app/office/page.tsx` + `layout.tsx` + components**
- `office/layout.tsx:4` — hand-rolled top nav `<header>`; log-out at lines 6-9 is a raw `<form>`+`<button>` instead of `<Button variant="ghost">`.
- `office/page.tsx:69` — raw flex `div` splitting sidebar/content; empty-state (lines 91-93) is a raw centered `div`.
- `InstructorSidebar.tsx` (client) — **best-integrated file in the app**: correctly imports and uses `Button` and full `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` (lines 4-11). Still raw: the instructor `<ul>/<li>` list (lines 83-104) with manual active-state `cn()` classes (93-98) instead of a variant. Structurally, this sidebar + the calendar content area is the closest match to `sidebar-03`/`sidebar-07`'s nav pattern.
- `CalendarGrid.tsx` (101 lines, client) — **the biggest true gap**: 100% custom CSS-grid time-grid, inline `style={{gridTemplateColumns, gridTemplateRows}}` (lines 27-30), manually computed 30-min slot math (`SLOT_COUNT=28`, 07:00–20:30), sticky headers via raw `div`s (lines 33, 37-45), lesson blocks absolutely positioned via computed `gridRow`/`gridColumn` (84-96). No shadcn Calendar primitive is installed, and none would fit this time-grid use case directly — this is legitimately custom work, but it could still be **visually** brought in line with the design system (spacing scale, border/shadow tokens, typography) even though its logic stays bespoke.
- `WeeklyCalendar.tsx` — `Button` imported for prev/next nav, but arrows are plain text glyphs (`← Prev`/`Next →`, lines 65/76) instead of `<ChevronLeft/>`/`<ChevronRight/>` from lucide.
- `LessonBlock.tsx` — `Button` abused as a positioned lesson chip (line 33); status colors are a hand-rolled `STATUS_COLORS` map (lines 13-17) instead of the installed-but-unused `Badge` with variants.
- `LessonPanel.tsx` (82 lines, client) — the slide-in side panel (lines 57-78) is a **fully hand-rolled Drawer**: manual `role="dialog" aria-modal="true"`, manual `fixed right-0 … translate-x` toggle (62-64), **no focus-trap, no backdrop, no Escape-to-close** — all of which the already-installed `drawer.tsx` (vaul-based) provides for free.
- `LessonPopover.tsx` (191 lines, client) — despite its name, doesn't use `Popover`; header close button uses a `✕` glyph (line 98) instead of a Lucide `X`; detail rows (Instructor/Student/Category/Scheduled, lines 103-123) are a copy-pasted label/value `div` pattern; status pill (126-132) duplicates the `STATUS_COLORS`-map pattern from `LessonBlock.tsx` **with different color values for the same statuses** — a visual inconsistency bug, not just a style gap; override-email checkbox+input (140-157) is raw, unstyled-component HTML.
- `NewLessonForm.tsx` (208 lines, client) — the largest, most complex client component in the app and furthest from shadcn: category/student pickers are **raw native `<select>`** (lines 122-135, 142-157) even though `Select` is already correctly used one file over in `InstructorSidebar.tsx`; same repeated label/value detail-row and checkbox+email patterns duplicated from `LessonPopover.tsx`; manual validation via `handleAction`+`setError` instead of `react-hook-form`+`zod`+`<Form>`.

**`/lesson/[token]` — `page.tsx` + `LessonResponseForm.tsx`**
- `page.tsx:41-44` — raw centered invalid-token state; lines 51-66 repeat the same label/value pattern seen in `LessonPopover.tsx`/`NewLessonForm.tsx` — confirmed duplicated across **3 files** with no shared component.
- `LessonResponseForm.tsx` (153 lines, client) — correctly uses installed `Button` and `Textarea` (lines 4-5). The approve/reject confirmation flow (lines 66-150) is hand-rolled as conditional JSX branches — exactly the use case for shadcn's `AlertDialog` pattern, done inline instead. Rejection-reason suggestion chips (116-124) are raw pill-styled `<button>`s rather than `Badge`/`Button variant="outline" size="sm"`.

### Duplicated patterns worth extracting (found across ≥2 files)

1. **Label/value detail row** (`<p className="text-xs text-zinc-500">Label</p><p className="text-sm font-medium">Value</p>`) — `lesson/[token]/page.tsx`, `LessonPopover.tsx`, `NewLessonForm.tsx`.
2. **`formatScheduledAt` date formatting** — duplicated verbatim in `LessonPopover.tsx` and `lesson/[token]/page.tsx`, near-duplicate `formatSlot` in `NewLessonForm.tsx`.
3. **Status → color class maps** — `LessonBlock.tsx` and `LessonPopover.tsx` define *different* color values for the same lesson statuses — an actual visual bug, not just duplication.
4. **Checkbox + conditional override-email input** — `LessonPopover.tsx` and `NewLessonForm.tsx`.

All four are prime candidates to become shared components built on shadcn primitives (a `DetailRow`, a `LessonStatusBadge` using `Badge` variants, a shared date formatter, a shared `OverrideEmailField`) rather than being ported ad hoc per-screen.

### Dark mode: tokens complete, mechanism absent

- `globals.css:5` — `@custom-variant dark (&:is(.dark *));` — **class-based**, not `prefers-color-scheme`-based. A CSS-only/media-query fix is not viable; a class-toggle mechanism (`next-themes` or equivalent) is required.
- `globals.css:51-84` (`:root`) and `:86-118` (`.dark`) — 29 tokens in `:root`, all but `--radius` (a non-color spacing token, correctly single-mode) mirrored in `.dark`. `@theme inline` (lines 7-49) correctly maps every one through to `--color-*`/`--radius-*` Tailwind utilities. **No gap here at all** — this part is done.
- `src/app/layout.tsx` (full file, 33 lines) — no `ThemeProvider`, no `suppressHydrationWarning` on `<html>` (line 26), no conditional `.dark` class logic, no blocking pre-paint script, `metadata` (lines 15-18) is still unmodified create-next-app boilerplate (title "Create Next App").
- `next-themes` is **not** a dependency (confirmed via `package.json` grep). `@base-ui/react` (already a dependency) ships no theme-switching primitive — it's headless interaction primitives only, not a substitute.
- No half-built toggle, sun/moon icon, or theme-related UI anywhere in the codebase — grepped and confirmed all `theme`/`Sun`/`Moon`/`prefers-color-scheme` hits are unrelated (calendar day-name comments, Sentry's own boilerplate demo page).

## Code References

- `context/changes/shadcn-design-refresh/change.md` — this change's tracking file
- `components.json` — shadcn config: style `base-nova`, `cssVariables: true`, `iconLibrary: "lucide"` (declared but unused)
- [`src/app/globals.css:5`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/globals.css#L5) — `@custom-variant dark` definition (class-based)
- [`src/app/globals.css:51-118`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/globals.css#L51-L118) — `:root`/`.dark` token pairs (complete)
- [`src/app/layout.tsx:1-33`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/layout.tsx#L1-L33) — root layout, no theme wiring
- [`src/components/ui/`](https://github.com/aleksandergorecki80/driving-school-planner/tree/38eece9d7bd134f101cd3243a05af11a91178692/src/components/ui) (`badge`, `button`, `drawer`, `popover`, `select`, `textarea`) — installed primitives (3 of 6 unused)
- [`src/app/login/page.tsx:17`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/login/page.tsx#L17), [`src/app/login/LoginForm.tsx`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/login/LoginForm.tsx) — hand-rolled card + form, zero primitives
- [`src/app/office/page.tsx`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/office/page.tsx), [`src/app/office/layout.tsx`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/office/layout.tsx) — hand-rolled shell/nav
- [`src/app/office/components/sidebar/InstructorSidebar.tsx:4-11,83-104`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/office/components/sidebar/InstructorSidebar.tsx#L4-L104) — best-integrated file; raw list
- [`src/app/office/components/calendar/CalendarGrid.tsx:27-30,84-96`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/office/components/calendar/CalendarGrid.tsx#L27-L96) — custom time-grid (legitimate, no matching block exists)
- [`src/app/office/components/calendar/WeeklyCalendar.tsx:65,76`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/office/components/calendar/WeeklyCalendar.tsx#L65-L76) — text-glyph nav arrows
- [`src/app/office/components/calendar/LessonBlock.tsx:13-17,33`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/office/components/calendar/LessonBlock.tsx#L13-L33) — hand-rolled status-color map, `Button` abused as chip
- [`src/app/office/components/lesson-panel/LessonPanel.tsx:57-78`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/office/components/lesson-panel/LessonPanel.tsx#L57-L78) — hand-rolled Drawer reimplementation
- [`src/app/office/components/lesson-panel/LessonPopover.tsx:21-157`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/office/components/lesson-panel/LessonPopover.tsx#L21-L157) — unused-`Popover` namesake, duplicated detail rows, inconsistent status colors
- [`src/app/office/components/lesson-panel/NewLessonForm.tsx:108-182`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/office/components/lesson-panel/NewLessonForm.tsx#L108-L182) — raw native `<select>` despite `Select` already used elsewhere; duplicated patterns
- [`src/app/lesson/[token]/page.tsx:41-66`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/lesson/%5Btoken%5D/page.tsx#L41-L66) — raw empty state, third copy of detail-row pattern
- [`src/app/lesson/[token]/components/LessonResponseForm.tsx:66-150`](https://github.com/aleksandergorecki80/driving-school-planner/blob/38eece9d7bd134f101cd3243a05af11a91178692/src/app/lesson/%5Btoken%5D/components/LessonResponseForm.tsx#L66-L150) — hand-rolled confirm flow (AlertDialog candidate), raw pill buttons

## Architecture Insights

- The project already paid the shadcn/ui setup cost (CLI dependency, `components.json`, full token system) but stopped after installing the bare minimum primitives needed for the features that shipped — adoption is shallow, not absent. This is a low-risk expansion (add primitives via `npx shadcn add`, no framework migration) rather than a redesign from scratch.
- `InstructorSidebar.tsx` and `LessonResponseForm.tsx` prove the pattern already works well when followed — they're the template to replicate, not new ground to break.
- The design-token layer (`globals.css`) was clearly built with dark mode in mind from the start (full `.dark` pairs exist) even though nothing consumes it yet — likely scaffolded by the shadcn CLI init (`cssVariables: true`) and never revisited.
- Several duplicated hand-rolled patterns (detail rows, status colors, date formatting) point to the office/lesson-panel components having grown independently across separate phases of `instructor-responds` without a shared UI layer being extracted — consistent with `AGENTS.md`'s "vertical slice" delivery model, where each slice ships its own screen without an enforced pass to consolidate shared UI.

## Historical Context (from prior changes)

- `context/changes/instructor-responds/reviews/impl-review.md:60-64` — a Plan-Adherence finding notes that a "**always use shadcn/ui components when building UI**" rule was lost during a branch-merge mixup and marked `PENDING` re-application into `context/foundation/lessons.md`. **Confirmed**: this entry is not present in the current `context/foundation/lessons.md` (5 unrelated lessons exist: FormEvent, FK `ON DELETE`, no non-null assertion, soft-delete, one-server-action-per-file, env-var guards, branch-per-commit). This research recommends re-adding it — see Open Questions.
- No other mention of "dark mode", "theme", "design system", or "shadcn" exists anywhere in `context/changes/**` or `context/archive/**` — this is genuinely new-scope work, not a revisited or previously-declined decision.

## Related Research

None found — no prior `research.md` in any change folder touches UI/design-system topics.

## Open Questions

1. **Should the lost "always use shadcn/ui components" lesson be re-added to `context/foundation/lessons.md` now**, independent of whether/when this redesign is planned? It's a process gap (a rule the team already agreed on, that silently dropped out) separate from the design work itself.
2. **Icon library**: `components.json` already declares `iconLibrary: "lucide"` but `lucide-react` isn't a dependency yet and nothing imports from it. Confirm this should be added as part of the primitive-expansion work (replacing `✕`/`←`/`→` glyphs) rather than treated as a separate decision.
3. **Scope boundary for `/` (Home)**: it's untouched `create-next-app` boilerplate, not a real screen. Worth deciding whether the redesign should also turn it into a redirect to `/login`/`/office`, or leave it explicitly out of scope.
4. **`react-hook-form` + `zod`**: neither is a current dependency. `NewLessonForm.tsx` and `LoginForm.tsx` both do manual validation. Adopting shadcn's `<Form>` primitive properly implies pulling in `react-hook-form`+`zod` — worth confirming that's an acceptable new dependency before a `/10x-plan` commits to it, versus keeping manual validation and only adopting the presentational primitives (`Input`, `Label`, `Card`).

## Recommended shadcn/ui additions (primitives + one block)

To install: `npx shadcn add card input label checkbox dialog alert-dialog table separator skeleton tooltip navigation-menu`, plus `lucide-react` as a plain dependency (already declared as the icon library in `components.json`, just never installed). Already-installed-but-unused (`badge`, `drawer`, `popover`) need no install — just wiring into the components already identified above.

One block worth adopting wholesale: **`login-03`** (`npx shadcn add login-03`) as the replacement for `LoginForm.tsx`/`login/page.tsx` — closest structural match found on the live blocks page today.

## Recommended dark-mode implementation path

1. `npm install next-themes`.
2. Wrap `{children}` in `src/app/layout.tsx` with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`, add `suppressHydrationWarning` to `<html>` (line 26).
3. Add a toggle control (e.g. in `office/layout.tsx`'s header, next to log-out) using `Button` + a `Sun`/`Moon` lucide icon pair, following the standard next-themes toggle pattern.
4. No `globals.css` changes needed — token layer is already correct.
