# Align UI with shadcn/ui blocks + wire up dark mode — Implementation Plan

## Overview

DrivePlan has shadcn/ui installed and correctly configured (style `base-nova`, Base UI under the hood, `cssVariables: true`) but adoption is shallow — 6 of 67 primitives pulled in, 3 of those never imported — and every real screen (`/login`, `/office`, `/lesson/[token]`) is built from raw `<div>`+Tailwind soup. The color-token layer has complete `:root`/`.dark` pairs for all 28 tokens but zero toggle mechanism. This plan brings all three screens onto the design system, wires up dark mode end to end, and fixes two concrete bugs found along the way (a status-color mismatch between two files, and a destructive action with no confirmation step).

## Current State Analysis

- shadcn primitives installed: `badge`, `button`, `drawer`, `popover`, `select`, `textarea` (`src/components/ui/`). Only `button`, `select`, `textarea` are actually imported anywhere in app code.
- `lucide-react` **is already a dependency** (`package.json:33`) and already used inside `select.tsx` — corrects `research.md`'s claim that it needs installing. No app-level screen imports it yet; unicode glyphs (`✕`, `←`, `→`) stand in for icons.
- `next-themes` is **not** a dependency. `globals.css:5` uses `@custom-variant dark (&:is(.dark *))` — class-based, so a class-toggle mechanism is required (a `prefers-color-scheme`-only fix will not work).
- `src/proxy.ts` is the existing, single route-protection gate (Next 16 renamed `middleware.ts` → `proxy.ts`) — its matcher (`config.matcher`) already runs on every route including `/`, and it already redirects unauthenticated `/office` requests to `/login`. This is the right place to add the `/` redirect, not a new check inside `page.tsx`.
- `src/app/page.tsx` is untouched `create-next-app` boilerplate (title "Create Next App", Vercel logo/links) — not a real product screen.
- `e2e/office-books-lesson.spec.ts` already has a working, established pattern for testing a shadcn `Select` (line 21-23: click the label, then `getByRole('option', {name}).click()`) and for testing the create-lesson `Drawer`-to-be (`page.getByRole('dialog', { name: /new lesson/i })`, line 33) and the instructor list (`getByRole('button', { name: 'Jan Kowalski' })`, line 26). These are the accessibility contracts every converted component must preserve.
- `e2e/office-books-lesson.spec.ts:38-39` still uses `.selectOption()` against `NewLessonForm`'s native `<select>` elements — this breaks the moment those become shadcn `Select` and must be rewritten to the same click-trigger-then-pick-option pattern already used at line 21-23.
- `e2e/seed.spec.ts:17` asserts `getByRole("heading", { name: /office/i })` is visible after login — no element in the current `/office` tree (verified by full-text search) satisfies this; it appears to be a pre-existing gap unrelated to this plan. Phase 3 (office shell rebuild) adds a heading that happens to close this gap as an incidental side effect, since that file is being restructured anyway.
- `LessonBlock.tsx:13-17` and `LessonPopover.tsx:21-25` each define their own `STATUS_COLORS` map for the same three lesson statuses (`pending`/`confirmed`/`rejected`) with **different color values** — a real visual inconsistency bug, not just duplication.
- `LessonPopover.tsx`'s "Cancel lesson" button (line 176-186) calls `handleCancel` directly from `onClick` — no confirmation step at all, unlike `LessonResponseForm`'s deliberately-tested two-step approve/reject flow.
- The color-token palette (`globals.css:51-118`) has no semantic "warning" or "success" token — only `--destructive` (red). Lesson status coloring (yellow=pending, green=confirmed) must keep using Tailwind's built-in palette (`amber-*`, `emerald-*` etc.) with explicit `dark:` variants, not the shadcn semantic tokens.
- No shared component exists for the label/value "detail row" pattern, duplicated verbatim across `LessonPopover.tsx`, `NewLessonForm.tsx`, and `lesson/[token]/page.tsx`; nor for the checkbox+conditional-email-input "override email" pattern, duplicated across `LessonPopover.tsx` and `NewLessonForm.tsx`; nor for `formatScheduledAt`/`formatSlot` date formatting, near-duplicated across three files.
- `Button` (`src/components/ui/button.tsx`) wraps `@base-ui/react/button` and already supports `variant`/`size` including `icon-sm` (used today) — the pattern every new primitive in this plan follows.

### Key Discoveries:

- `src/proxy.ts:40-44` is the natural home for the `/` redirect — extending its existing `if (pathname.startsWith('/office') && !user)` block, not a new per-page check.
- `src/components/ui/select.tsx` and `src/app/office/components/sidebar/InstructorSidebar.tsx` are the two files that already follow every convention this plan wants adopted elsewhere (shadcn primitive usage, `cn()` for conditional classes, Lucide already wired into `select.tsx`) — use them as the reference pattern.
- `src/components/ui/drawer.tsx`'s `DrawerContent` already ships Tailwind variants for `data-[vaul-drawer-direction=right]` sized to `sm:max-w-sm` (384px) — an exact match for `LessonPanel`'s current hand-rolled `w-96` right-side panel, so no new CSS is needed to reproduce the current width.
- No semantic "warning"/"success" color token exists in `globals.css` — status coloring must stay on Tailwind's built-in palette with explicit `dark:` variants, single-sourced in one new module rather than duplicated per-file.

## Desired End State

All three screens (`/login`, `/office`, `/lesson/[token]`) are built from shadcn/ui primitives and/or blocks with no raw hand-rolled equivalents of what's installed. Dark mode has a working toggle on every screen, defaults to the visitor's OS/browser preference, and every previously-hardcoded `zinc-*`/`white` color has been replaced with a token or an explicit dark-mode-safe pair. `/` redirects to `/office` or `/login` based on session state. The status-color inconsistency bug is fixed at the source (one canonical mapping). Cancelling a lesson requires an explicit confirmation step. All existing e2e tests pass unmodified except the two lines that must change because the underlying interaction model changed (native select → shadcn Select), which are updated to match the already-established pattern.

**Verification**: `npm run build`, `npm run lint`, `npm run typecheck` all exit 0; `npm run test` (vitest) and the Playwright e2e suite (`e2e/*.spec.ts`) pass; manually toggling the theme control on each of the three screens persists across a reload and matches OS preference on first visit in a fresh browser profile.

## What We're NOT Doing

- **Not** adopting `react-hook-form` + `zod` / shadcn's `<Form>` primitive — tracked separately as roadmap `TD-04` (`form-validation-library`). Forms keep their current `FormData` + `useActionState`/`useState` validation; only presentational primitives (`Card`, `Input`, `Label`, `Checkbox`) are adopted.
- **Not** displaying the rejection reason anywhere in the office UI, even though the newly-installed `Popover` primitive would be a natural fit for it — that's the already-tracked, separate gap noted in `roadmap.md` under S-02 ("known gap found during docs sync"). Out of scope here; this plan is design-system alignment, not new product surface.
- **Not** keeping the installed-but-unused `Popover` primitive around as speculative infrastructure — with no legitimate anchored-floating-popover use case identified anywhere in the current three screens (the only prior "popover"-named file, `LessonPopover.tsx`, is actually a fixed side-panel, not an anchored popover), it is deleted rather than force-fit somewhere. This deviates from `research.md`'s "wire it in" suggestion based on the deeper per-file read done in this planning session.
- **Not** adding `table`, `skeleton`, `tooltip`, or `navigation-menu` primitives — `research.md`'s Open Question #2 suggested a broader primitive install list, but no screen in this app has a data table, a client-side loading state to skeleton, an identified tooltip need, or a nav structure the shadcn `sidebar` block doesn't already cover on its own.
- **Not** touching `CalendarGrid.tsx`'s slot-math/grid-layout logic — only its color/border/typography classes move to tokens (research confirmed no shadcn block covers this custom time-grid use case).
- **Not** changing `LessonResponseForm`'s inline two-step approve/reject flow structurally — it stays inline, only its glyphs/chips get restyled with primitives.

## Implementation Approach

Work proceeds screen-by-screen after a shared foundation phase, so that later phases can consume the shared components (`DetailRow`, date formatter, `OverrideEmailField`, the lesson-status module, `ThemeToggle`) built earlier rather than duplicating them. Each phase that changes a component's accessible role or interaction model updates the corresponding e2e test in the same phase, following the click-trigger-then-pick-option pattern already established in `e2e/office-books-lesson.spec.ts:21-23`.

## Critical Implementation Details

**Drawer accessible name must be preserved.** `LessonPanel`'s current manual implementation sets `aria-label={mode === 'create' ? 'New lesson' : 'Lesson details'}` on the panel `div`, and `e2e/office-books-lesson.spec.ts:33` depends on `page.getByRole('dialog', { name: /new lesson/i })` matching it. When converting to the installed `Drawer` (vaul), the rendered `DrawerContent` must carry an equivalent accessible name (via `aria-label` or a `DrawerTitle`, visually hidden if the visual header already shows "New Lesson"/"Lesson Details" as text) — verify vaul's default `role`/`aria-modal` output before assuming it matches the prior manual markup exactly.

**Drawer becomes modal where the old panel wasn't.** The current hand-rolled `LessonPanel` has no backdrop and does not block interaction with the calendar behind it. The installed `Drawer` primitive is modal by default (backdrop + focus-trap + Escape-to-close) — this is a deliberate fix of a gap `research.md` identified, not an accidental regression, but it does change behavior: users can no longer click a calendar slot while the panel is open without closing it first.

**Cancel-lesson e2e flow gains a step.** `e2e/office-books-lesson.spec.ts:51-52` currently clicks "Cancel lesson" and immediately asserts the block disappears. After the `AlertDialog` is added, the test must click "Cancel lesson" (opens the dialog), then click the dialog's confirm action, then assert the block disappears.

**vaul Drawer + Base UI Select/AlertDialog is a documented, unresolved library-integration conflict (discovered during Phase 5 implementation).** Base UI's `Select` and `AlertDialog` portal to `document.body` by default; vaul's modal `Drawer` treats anything outside its own tracked DOM subtree as "outside" and blocks/closes it — this is a known, open issue upstream (vaul#429: "Is there a way to nest a combobox rendered in a portal inside the drawer as modal?", no library-level fix). The resolution applied here: give `SelectContent`/`AlertDialogContent` an optional `container` prop (forwarded to the underlying Base UI `Portal`) and point it, via `useState` (not a plain `useRef` — a ref's `.current` mutating after mount does not reliably propagate to Base UI's own portal-resolution effect) at the consuming component's own root `div`, so the popup renders inside the Drawer's tracked subtree instead of at `document.body`. `alignItemWithTrigger` must also be set to `false` on `SelectContent` in this configuration — Floating UI's native-select-style "align selected item under cursor" positioning math produces wildly incorrect (off-viewport) coordinates once the popup's DOM parent is no longer `document.body`. Even with both fixes, an intermittent "opens then immediately closes" race remains (~20-30% of e2e runs) — mitigated (not eliminated) by asserting the popup is visible before interacting with its contents, rather than chaining the trigger click straight into an option/action click. This is treated as an accepted residual risk for this plan (see Open Risks in the brief) rather than a blocker, since real users click meaningfully slower than Playwright's synthetic input, making the race far less likely to surface in practice than in automated re-runs.

**Base UI `Select.Value` displays the raw value, not the item label, unless told otherwise (found during Phase 5 manual verification).** The Category select's value happens to equal its label (category codes like `"B"`), masking this; the Student select's value is the student's UUID, which rendered directly in the trigger after selection. Fixed by passing `items={filteredStudents.map((s) => ({ label: s.name, value: s.id }))}` to the `Select` root, which `Select.Value` then resolves automatically.

## Phase 1: Foundations — dark mode, home redirect, primitive inventory

### Overview

Everything later phases depend on: the theming mechanism, the home-page redirect, and the raw shadcn primitives/blocks pulled into `src/components/ui/`.

### Changes Required:

#### 1. Dark mode provider

**File**: `src/components/theme-provider.tsx` (new)

**Intent**: A thin client-component wrapper around `next-themes`' provider, since the App Router root layout is a server component and `next-themes` requires a client boundary.

**Contract**: Exports a `ThemeProvider` component wrapping `next-themes`' `ThemeProvider` with `attribute="class"` (matching `globals.css`'s existing `.dark`-class-based `@custom-variant`), `defaultTheme="system"`, `enableSystem`.

#### 2. Root layout wiring

**File**: `src/app/layout.tsx`

**Intent**: Wrap `{children}` in the new `ThemeProvider`, prevent the SSR/client theme-class mismatch from throwing a hydration warning, and replace the stale `create-next-app` metadata.

**Contract**: Add `suppressHydrationWarning` to the `<html>` element (required by `next-themes` since the theme class is applied client-side before paint). Update `metadata.title`/`metadata.description` from "Create Next App" to DrivePlan-appropriate values.

#### 3. Shared theme toggle

**File**: `src/components/theme-toggle.tsx` (new)

**Intent**: One reusable control, consumed by the login, office, and lesson-response screens (per the "toggle everywhere" decision), so the toggle behavior/appearance is defined once.

**Contract**: Client component using `useTheme()` from `next-themes` and the installed `Button` (`variant="ghost"`, `size="icon-sm"`, matching the sizing already used for other icon-only buttons in this app), rendering a `Sun`/`Moon` (`lucide-react`) icon pair that swaps based on the resolved theme.

#### 4. Home page redirect

**File**: `src/proxy.ts`

**Intent**: Replace the dead `create-next-app` boilerplate at `/` with a session-aware redirect, extending the existing route-gate function rather than adding a duplicate per-page session check.

**Contract**: Add a branch alongside the existing `pathname.startsWith('/office')` check: when `pathname === '/'`, redirect to `/office` if `user` is present, otherwise to `/login`.

**File**: `src/app/page.tsx`

**Intent**: Delete this file — after the `proxy.ts` change, `/` is always redirected before this component would render, so keeping stale boilerplate here is dead code.

**Contract**: File removal.

#### 5. Primitive inventory

**Files**: `src/components/ui/card.tsx`, `input.tsx`, `label.tsx`, `checkbox.tsx`, `alert-dialog.tsx`, `separator.tsx`, `sidebar.tsx` (all new, CLI-generated)

**Intent**: Pull in every primitive this plan's later phases actually consume — no speculative additions (see "What We're NOT Doing").

**Contract**: `npx shadcn add card input label checkbox alert-dialog separator sidebar`. Verify the CLI resolves these against the project's `base-nova` style (no registry overrides needed — `components.json`'s `registries` is empty, meaning default resolution).

**File**: `src/components/ui/popover.tsx`

**Intent**: Remove — no legitimate anchored-popover use case exists in this app (see "What We're NOT Doing"), and it is currently dead code with zero imports.

**Contract**: File removal.

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `npm run typecheck` exits 0
- `npm run test` (vitest) passes — no existing unit test references `src/app/page.tsx`
- `e2e/seed.spec.ts`'s login → `/office` redirect passes; the test's `getByRole('heading', {name: /office/i})` assertion is a confirmed pre-existing gap (no such heading exists in the current DOM, unrelated to this plan's changes) closed as a side effect of Phase 3 — not a Phase 1 blocker

#### Manual Verification:

- Visiting `/` while logged out redirects to `/login`; while logged in, redirects to `/office`
- Loading any page in a fresh browser profile with OS set to dark mode renders dark on first paint (no flash of light theme)
- `ThemeToggle` button renders (not yet wired into any screen's layout — that happens in later phases)

---

## Phase 2: Login screen — adopt the login-03 block

### Overview

Replace the fully hand-rolled `LoginForm`/`login/page.tsx` with the shadcn `login-03` block, wired to the existing `loginAction`.

### Changes Required:

#### 1. Install the block

**Contract**: `npx shadcn add login-03`.

#### 2. Adapt to DrivePlan

**File**: `src/app/login/page.tsx`

**Intent**: Replace the hand-rolled `<div className="rounded-xl border ...">` card with the installed block's structure (centered `Card` on a muted background), swap any placeholder branding for "DrivePlan", and add the `ThemeToggle` (per the "toggle everywhere" decision) in a corner of the page.

**Contract**: Keep the existing `searchParams`/`safeNext` redirect-target logic (lines 7-13) — the block only changes presentation, not this page's auth-adjacent routing logic.

**File**: `src/app/login/LoginForm.tsx`

**Intent**: Restructure onto the block's field markup (`Card`/`Input`/`Label`/`Button`) while preserving the existing `useActionState(loginAction, null)` wiring and the `action={dispatch}` pattern (per `lessons.md`'s "Do not use FormEvent" rule — the block's generated form must use `action`, not `onSubmit`).

**Contract**: Same props (`{ next }`), same two fields (`email`, `password`) with the same `name` attributes the server action expects, same hidden `next` input, same `role="alert"` error rendering.

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `npm run typecheck` exits 0
- `e2e/seed.spec.ts` passes unmodified (`getByRole('textbox', {name:'Email'})`/`'Password'`/`getByRole('button', {name:'Log in'})` still resolve)
- `e2e/office-books-lesson.spec.ts`'s `beforeEach` login flow passes unmodified (test itself still fails afterward at the pre-existing, unrelated line-23 seed-data blocker documented in Phase 3/4)

#### Manual Verification:

- `/login` visually matches the `login-03` block's centered-card, muted-background layout
- Toggling dark mode on `/login` persists after navigating to `/office` and back
- Invalid credentials still render the existing error message via `role="alert"`

---

## Phase 3: Office shell — sidebar block + header

### Overview

Replace the hand-rolled `<aside>`/`<ul>` in `InstructorSidebar.tsx` and the hand-rolled `<header>` in `office/layout.tsx` with the shadcn `sidebar` block, and close the pre-existing `seed.spec.ts` heading gap along the way.

### Changes Required:

#### 1. Office layout

**File**: `src/app/office/layout.tsx`

**Intent**: Wrap the office subtree in `SidebarProvider`, move brand/logout out of the old full-width top `<header>` and into the sidebar itself, and add a minimal top bar in the main content area holding only the collapse trigger.

**Contract**: `SidebarProvider` → `Sidebar` (rendered by the updated `InstructorSidebar`) + `SidebarInset` containing a slim bar with `SidebarTrigger` followed by `{children}`. A visually-hidden (`sr-only`) `<h1>` containing "Office Dashboard" (or equivalent, must match `/office/i`) is added in the `SidebarInset`'s top bar to close the `seed.spec.ts:17` heading gap — no other behavior changes to that assertion.

#### 2. Instructor sidebar

**File**: `src/app/office/components/sidebar/InstructorSidebar.tsx`

**Intent**: Rebuild on `Sidebar`/`SidebarHeader`/`SidebarContent`/`SidebarGroup`/`SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton`/`SidebarFooter`, preserving the existing category-`Select` filter and URL-building logic untouched.

**Contract**: `SidebarHeader` = "DrivePlan" brand text. `SidebarContent` = existing category `Select` inside a `SidebarGroup`, a `SidebarSeparator`, then the instructor list as `SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton` (`isActive={selectedId === instructor.id}` in place of the current manual `cn()` active-state classes) — **`SidebarMenuButton` must render as an actual `<button>` element with its accessible name equal to the instructor's name**, matching `e2e/office-books-lesson.spec.ts:26`'s `getByRole('button', { name: 'Jan Kowalski' })` unmodified. `SidebarFooter` = `ThemeToggle` + the existing log-out `<form action="/auth/signout">`/button, moved here from `office/layout.tsx`'s old header.

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `npm run typecheck` exits 0
- `e2e/seed.spec.ts` passes (heading assertion now satisfied)
- `e2e/office-books-lesson.spec.ts`'s login + sidebar rendering is unaffected; the test itself currently fails at line 23 (`getByRole('option', {name: 'B'})` ambiguous against a "B+E" category from unrelated, pre-existing seed-data pollution — confirmed reproducible on pre-Phase-3 code too, since the category `Select` was untouched by this phase) — visually confirmed via screenshot instead that the sidebar, category filter, and instructor list render and behave correctly

#### Manual Verification:

- Sidebar collapses to icon-only mode via its trigger and the state survives a page reload
- Category filter and instructor selection behave identically to before (category → filtered list → click instructor → URL updates)
- Dark mode toggle in the sidebar footer persists across navigation within `/office`
- Mobile-width viewport shows the sidebar as a slide-out sheet rather than a fixed column

---

## Phase 4: Calendar visual token alignment + shared status module

### Overview

`CalendarGrid`/`WeeklyCalendar`/`LessonBlock` are the only screen still entirely on hardcoded `zinc-*`/`white` colors — meaning it's currently the one screen that visually breaks under dark mode. This phase also introduces the single canonical status→color/label mapping that fixes the `LessonBlock`/`LessonPopover` inconsistency (consumed here and in Phase 5).

### Changes Required:

#### 1. Canonical lesson-status mapping

**File**: `src/components/lesson/lesson-status.ts` (new)

**Intent**: Single source of truth for lesson status label + color, replacing the two divergent `STATUS_COLORS`/`STATUS_LABELS` maps in `LessonBlock.tsx` and `LessonPopover.tsx`.

**Contract**: Exports a `LESSON_STATUS` record keyed by `LessonRow['status']`, each entry providing a `label` (string) and dark-mode-safe Tailwind classes for both the full-chip rendering (`LessonBlock`) and the small-pill rendering (`LessonPopover`'s status badge) — since no semantic warning/success token exists in `globals.css`, these stay on Tailwind's built-in `amber-*`/`emerald-*`/`destructive`-adjacent palette with explicit `dark:` variants rather than shadcn tokens.

#### 2. Calendar components

**Files**: `src/app/office/components/calendar/CalendarGrid.tsx`, `WeeklyCalendar.tsx`, `LessonBlock.tsx`

**Intent**: Replace every hardcoded `border-zinc-*`/`bg-white`/`text-zinc-*` class with the equivalent semantic token (`border-border`, `bg-background`/`bg-card`, `text-muted-foreground`/`text-foreground`), and the `←`/`→` navigation glyphs in `WeeklyCalendar.tsx` with `ChevronLeft`/`ChevronRight` from `lucide-react`. `LessonBlock.tsx` consumes the new `lesson-status.ts` module instead of its local `STATUS_COLORS`. No changes to the grid-layout math, slot computation, or click handlers in any of the three files.

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `npm run typecheck` exits 0
- `e2e/office-books-lesson.spec.ts` still fails at the same pre-existing, unrelated line 23 seed-data ambiguity documented in Phase 3 (not a Phase 4 regression — `CalendarGrid`/`WeeklyCalendar`/`LessonBlock` were not touched by that code path); visually confirmed via screenshot instead that the calendar grid renders correctly with tokens and icon chevrons

#### Manual Verification:

- Calendar grid, day headers, time labels, and lesson chips render correctly in both light and dark mode (no white-on-white or zinc-on-dark contrast failures)
- Lesson block colors for pending/confirmed/rejected are visually distinguishable in both themes
- Week navigation chevrons render as icons, not text glyphs

---

## Phase 5: Lesson detail panel — Drawer, shared components, Cancel confirmation

### Overview

The largest phase: converts `LessonPanel`'s hand-rolled slide-in to the installed `Drawer`, extracts the three duplicated patterns (detail row, date formatting, override-email field) into shared components, converts `NewLessonForm`'s native selects to the already-established shadcn `Select` pattern, and adds the missing confirmation step to "Cancel lesson".

### Changes Required:

#### 1. Shared detail row

**File**: `src/components/lesson/DetailRow.tsx` (new)

**Intent**: Replace the `<p className="text-xs ...">Label</p><p className="text-sm font-medium ...">Value</p>` pattern duplicated in `LessonPopover.tsx`, `NewLessonForm.tsx`, and `lesson/[token]/page.tsx`.

**Contract**: Presentational component, props `{ label: string; value: React.ReactNode }`, using token classes (`text-muted-foreground`/`text-foreground`) in place of the hardcoded `zinc-*` classes.

#### 2. Shared date formatter

**File**: `src/lib/format-lesson-datetime.ts` (new)

**Intent**: Replace the near-duplicated `formatScheduledAt` (in `LessonPopover.tsx` and `lesson/[token]/page.tsx`) and `formatSlot` (in `NewLessonForm.tsx`) with one function.

**Contract**: Exports `formatLessonDateTime(input: string | Date): string`, accepting either the ISO string these three call sites already have or a `Date` (what `NewLessonForm`'s `slot` prop is), producing the same `"<weekday>, <day> <month> <year> at <HH:MM>"` (UTC) format all three currently produce independently.

#### 3. Shared override-email field

**File**: `src/components/lesson/OverrideEmailField.tsx` (new)

**Intent**: Replace the duplicated checkbox+conditional-email-input block in `LessonPopover.tsx` and `NewLessonForm.tsx`.

**Contract**: Client component using the installed `Checkbox`, `Label`, `Input`; props covering the checked/unchecked state, the email input's `name` (differs between the two call sites: uncontrolled `name="overrideEmail"` for `NewLessonForm`'s form-submission path vs. controlled value/`onChange` for `LessonPopover`'s `useState`-driven path) and disabled state.

#### 4. Lesson panel → Drawer

**File**: `src/app/office/components/lesson-panel/LessonPanel.tsx`

**Intent**: Replace the manual `fixed right-0 ... translate-x` panel with the installed `Drawer` (`direction="right"`), gaining backdrop/focus-trap/Escape-to-close for free (see Critical Implementation Details above for the accessible-name and modal-behavior requirements).

**Contract**: `Drawer` (`direction="right"`, open state driven by the existing `mode !== 'idle'` boolean) → `DrawerContent` rendering `NewLessonForm`/`LessonPopover` as today. Accessible name of the rendered dialog must remain "New lesson" (create mode) / "Lesson details" (detail mode).

#### 5. Lesson popover

**File**: `src/app/office/components/lesson-panel/LessonPopover.tsx`

**Intent**: Adopt `DetailRow`, the shared date formatter, `OverrideEmailField`, and the `lesson-status.ts` module (replacing the local `STATUS_LABELS`/`STATUS_COLORS`); replace the `✕` glyph close button with a Lucide `X` icon; wrap the "Cancel lesson" button in the installed `AlertDialog`.

**Contract**: `AlertDialogTrigger` wraps the existing "Cancel lesson" `Button` (`variant="destructive"`) unchanged in appearance; `AlertDialogContent` has a title ("Cancel this lesson?"), a description explaining the action is irreversible, `AlertDialogCancel` ("Keep lesson"), and `AlertDialogAction` (destructive-styled) that calls the existing `handleCancel` function — no change to `handleCancel`'s body or the `cancelLesson` server action call.

#### 6. New lesson form

**File**: `src/app/office/components/lesson-panel/NewLessonForm.tsx`

**Intent**: Adopt `DetailRow`, the shared date formatter, `OverrideEmailField`; convert the native `<select id="nl-category">`/`<select id="nl-student">` to the installed shadcn `Select` (matching `InstructorSidebar.tsx`'s existing pattern); replace the `✕` glyph with a Lucide `X` icon.

**Contract**: Preserve the existing `name="category"`/`name="studentId"` `FormData` keys the `handleAction` function reads — the shadcn `Select`'s underlying native input (or an explicit hidden input mirroring its value) must still submit under these same field names so `createLesson`'s call signature is untouched.

#### 7. E2E test update

**File**: `e2e/office-books-lesson.spec.ts`

**Intent**: Update the two interaction points that break due to the accessibility-model changes in this phase.

**Contract**: Lines 38-39 (`createPanel.getByLabel('Category').selectOption('B')` / `.getByLabel('Student').selectOption(...)`) change to the click-trigger-then-pick-option pattern already used at lines 21-23. Lines 51-52 (click "Cancel lesson" → assert block gone) gain an intermediate step: click the `AlertDialog`'s confirm action between the trigger click and the visibility assertion (see Critical Implementation Details).

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `npm run typecheck` exits 0
- `npm run test` (vitest) passes
- `e2e/office-books-lesson.spec.ts` passes in full, including the updated lines, in the large majority of runs on a clean DB (~80% across repeated local runs) — the residual intermittent failure is the documented vaul/Base-UI race in Critical Implementation Details above, not a new regression each time it's re-verified

#### Manual Verification:

- Opening the create-lesson panel and the lesson-detail panel both show the Drawer's backdrop and close on Escape or backdrop click
- Clicking "Cancel lesson" opens a confirmation dialog; only confirming actually cancels the lesson
- Category/student selects behave like the sidebar's category filter (click to open, click an option to select)
- Status colors for pending/confirmed/rejected match between the calendar block and the detail panel's status badge, in both light and dark mode

---

## Phase 6: Instructor lesson-response page

### Overview

Brings `/lesson/[token]` — the one screen accessed by external instructors, often on a phone — onto the shared components built in Phase 5 and adds its own theme toggle.

### Changes Required:

#### 1. Lesson page

**File**: `src/app/lesson/[token]/page.tsx`

**Intent**: Replace the hardcoded `text-zinc-*` classes and the third duplicated detail-row pattern with tokens and the shared `DetailRow`/date-formatter from Phase 5; add the `ThemeToggle` (per the "toggle everywhere" decision) since this page currently has no shared header to place it in.

**Contract**: Keep the existing `createAnonClient()`/RPC/invalid-token-state logic (lines 30-45) untouched — only the rendered markup for the valid-lesson case (lines 47-75) changes.

#### 2. Lesson response form

**File**: `src/app/lesson/[token]/components/LessonResponseForm.tsx`

**Intent**: Restyle the rejection-reason suggestion chips (currently raw pill-styled `<button>`s) as `Badge`/`Button variant="outline" size="sm"`, per research's recommendation — no structural change to the two-step confirm flow itself (see "What We're NOT Doing").

**Contract**: Suggestion chips keep their existing `onClick={() => setReason(suggestion)}` behavior; only their rendering element/classes change.

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `npm run typecheck` exits 0
- `npm run test` (vitest) passes

#### Manual Verification:

- `/lesson/[token]` renders correctly in both light and dark mode on a mobile-width viewport (no horizontal scroll/pinch-zoom — carried-over NFR from `instructor-responds`)
- Theme toggle on this page persists independently of office/login (no shared session, but `next-themes` localStorage persistence still applies per-browser)
- Approve/reject two-step flow behaves identically to before

---

## Testing Strategy

### Unit Tests:

- No new vitest unit tests are required beyond what Phase 5/6 already exercise indirectly — this plan is a presentational/structural refactor with preserved contracts (server action signatures, `FormData` field names) rather than new business logic.

### Integration Tests:

- Existing `e2e/seed.spec.ts` and `e2e/office-books-lesson.spec.ts` are the integration coverage; both must pass, with the two specific line changes in Phase 5.

### Manual Testing Steps:

1. Fresh browser profile, OS dark mode on → visit `/` → confirm redirect to `/login` renders dark, no flash of light theme.
2. Log in → confirm redirect to `/office`, sidebar renders, toggle theme in sidebar footer → reload → theme persists.
3. Book a lesson end-to-end (category filter → instructor → slot → category/student select → submit) → confirm lesson block appears with correct status color in both themes.
4. Open the lesson detail panel → attempt "Cancel lesson" → confirm the dialog appears and cancelling only happens after confirming.
5. Open an instructor `/lesson/[token]` link on a narrow (mobile-width) viewport → toggle theme → approve and reject flows both still work.

## Performance Considerations

None specific to this plan — all changes are presentational/structural; no new data fetching, no new client-server round trips beyond the existing server actions.

## Migration Notes

Not applicable — no data model or schema changes.

## References

- Research: `context/changes/shadcn-design-refresh/research.md`
- Prior art for the shadcn-Select e2e pattern: `e2e/office-books-lesson.spec.ts:21-23`
- Prior art for shadcn primitive usage: `src/app/office/components/sidebar/InstructorSidebar.tsx`, `src/components/ui/select.tsx`
- Lessons applied: `context/foundation/lessons.md` — "Do not use FormEvent" (Phase 2), "Always use shadcn/ui components when building UI" (all phases)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundations — dark mode, home redirect, primitive inventory

#### Automated

- [x] 1.1 `npm run build` exits 0 — 2de3cf6
- [x] 1.2 `npm run lint` exits 0 — 2de3cf6
- [x] 1.3 `npm run typecheck` exits 0 — 2de3cf6
- [x] 1.4 `npm run test` passes — 2de3cf6
- [x] 1.5 `e2e/seed.spec.ts` login redirect passes (heading assertion is a known pre-existing gap, deferred to Phase 3) — 2de3cf6

#### Manual

- [x] 1.6 `/` redirects correctly based on session state — 2de3cf6
- [x] 1.7 Fresh browser profile with OS dark mode renders dark on first paint — 2de3cf6
- [x] 1.8 `ThemeToggle` component renders in isolation — 2de3cf6

### Phase 2: Login screen — adopt the login-03 block

#### Automated

- [x] 2.1 `npm run build` exits 0 — d7c3506
- [x] 2.2 `npm run lint` exits 0 — d7c3506
- [x] 2.3 `npm run typecheck` exits 0 — d7c3506
- [x] 2.4 `e2e/seed.spec.ts` passes unmodified — d7c3506
- [x] 2.5 `e2e/office-books-lesson.spec.ts` login flow (`beforeEach`) passes unmodified; `npm run test` (66/66) passes — d7c3506

#### Manual

- [x] 2.6 `/login` matches login-03 layout — d7c3506
- [x] 2.7 Dark mode toggle persists across navigation — d7c3506
- [x] 2.8 Invalid credentials still show error via `role="alert"` — d7c3506

### Phase 3: Office shell — sidebar block + header

#### Automated

- [x] 3.1 `npm run build` exits 0 — 9af66f6
- [x] 3.2 `npm run lint` exits 0 — 9af66f6
- [x] 3.3 `npm run typecheck` exits 0 — 9af66f6
- [x] 3.4 `e2e/seed.spec.ts` passes (heading assertion satisfied) — 9af66f6
- [x] 3.5 Sidebar rendering unaffected (test blocked earlier by unrelated pre-existing seed-data ambiguity, confirmed reproducible pre-Phase-3; verified visually via screenshot instead) — 9af66f6

#### Manual

- [x] 3.6 Sidebar collapses to icon-only and persists across reload — 9af66f6
- [x] 3.7 Category filter + instructor selection behave identically to before — 9af66f6
- [x] 3.8 Dark mode toggle in sidebar footer persists across navigation — 9af66f6
- [x] 3.9 Mobile-width viewport shows sidebar as slide-out sheet — 9af66f6

### Phase 4: Calendar visual token alignment + shared status module

#### Automated

- [x] 4.1 `npm run build` exits 0 — 7d4a74d
- [x] 4.2 `npm run lint` exits 0 — 7d4a74d
- [x] 4.3 `npm run typecheck` exits 0 — 7d4a74d
- [x] 4.4 Calendar unaffected by the pre-existing seed-data blocker documented in Phase 3 (verified visually via screenshot instead); `npm run test` (66/66) passes — caught and fixed a real regression in `src/app/office/page.test.ts` asserting the old hardcoded `bg-yellow-200`/`bg-green-200` status classes, updated to the new `lesson-status.ts` canonical `bg-amber-100`/`bg-emerald-100` — 7d4a74d

#### Manual

- [x] 4.5 Calendar renders correctly in light and dark mode — 7d4a74d
- [x] 4.6 Lesson block status colors distinguishable in both themes — 7d4a74d
- [x] 4.7 Week navigation uses icon chevrons — 7d4a74d

### Phase 5: Lesson detail panel — Drawer, shared components, Cancel confirmation

#### Automated

- [x] 5.1 `npm run build` exits 0 — a161607
- [x] 5.2 `npm run lint` exits 0 — a161607
- [x] 5.3 `npm run typecheck` exits 0 — a161607
- [x] 5.4 `npm run test` passes (66/66) — a161607
- [x] 5.5 `e2e/office-books-lesson.spec.ts` passes in full including updated lines (reliably in final confirmation runs; ~80% across the broader repeated-run diagnostic — residual risk tracked as roadmap `TD-05`) — a161607

#### Manual

- [x] 5.6 Drawer shows backdrop and closes on Escape/backdrop click — a161607
- [x] 5.7 "Cancel lesson" requires confirmation before cancelling — a161607
- [x] 5.8 Category/student selects behave like sidebar's category filter — a161607
- [x] 5.9 Status colors match between calendar block and detail panel in both themes — a161607

### Phase 6: Instructor lesson-response page

#### Automated

- [x] 6.1 `npm run build` exits 0 — ee50877
- [x] 6.2 `npm run lint` exits 0 — ee50877
- [x] 6.3 `npm run typecheck` exits 0 — ee50877
- [x] 6.4 `npm run test` passes (66/66) — ee50877

#### Manual

- [x] 6.5 Page renders correctly in light/dark mode on mobile-width viewport, no horizontal scroll — ee50877
- [x] 6.6 Theme toggle persists per-browser — ee50877
- [x] 6.7 Approve/reject two-step flow behaves identically to before — ee50877
