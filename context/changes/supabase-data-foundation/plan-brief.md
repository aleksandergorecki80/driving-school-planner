# Supabase Data Foundation (F-01) — Plan Brief

> Full plan: `context/changes/supabase-data-foundation/plan.md`

## What & Why

Wire Supabase into the Next.js project and establish the data layer that every other roadmap slice depends on. Without F-01 there is no database to write lessons to, no instructor to filter by, and no student to attach — F-02 (auth), S-01 (office books lesson), and S-02 (instructor responds) all block on this foundation.

## Starting Point

A clean Next.js 16.2.6 scaffold with React 19 and Tailwind CSS 4. No Supabase packages, no schema, no environment files, no middleware, no API routes — only placeholder UI and a Vercel deployment link. The Supabase project exists hosted; this plan connects the codebase to it.

## Desired End State

`@supabase/supabase-js` + `@supabase/ssr` installed; `supabase/migrations/` contains one SQL file defining the `lesson_status` enum and three tables (`instructors`, `students`, `lessons`) with FK constraints and RLS enabled; `supabase/seed.sql` seeds 5 instructors (all licence categories covered, tokens auto-generated) and 8 students; both applied to the hosted Supabase project; `src/lib/supabase/server.ts` and `client.ts` importable; `npm run build` passes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Category storage | `text[]` column on `instructors` | Simple array queries cover the MVP filter pattern without JOIN complexity at MVP data volume | Plan |
| Instructor token | Added in F-01 (`DEFAULT gen_random_uuid()`) | F-01 unlocks F-02; having tokens in seed data means F-02 can test URL flows immediately without a schema migration | Plan |
| Supabase CLI | Init `supabase/` directory, migrations in git | Schema version-controlled alongside code is non-negotiable for reliable reset and replay | Plan |
| RLS | Enabled on all tables, no policies yet | Service role bypasses RLS automatically — correct security baseline without blocking F-01 development; F-02 adds access policies | Plan |
| Status field | PostgreSQL `lesson_status` enum | Database enforces the constraint; aligns with TypeScript type generation when added | Plan |
| Client structure | Two files: `server.ts` + `client.ts` | Official `@supabase/ssr` pattern — mixing server-only `cookies()` API with browser code causes Next.js module boundary errors | Plan |
| Seed location | `supabase/seed.sql` | Pairs with `supabase db reset` for one-command local reset; plain SQL is more portable than a TypeScript script | Plan |

## Scope

**In scope:** Package install; Supabase CLI init + link; `.env.example`; schema migration (enum + 3 tables + RLS); seed data (5 instructors, 8 students); client utilities (`server.ts`, `client.ts`); build verification.

**Out of scope:** Auth middleware; API routes or server actions; lesson records; service-role client utility; TypeScript type generation; local Docker dev environment; DB-level category-coherence constraint.

## Architecture / Approach

Hosted-only Supabase workflow (no Docker): migrations tracked in git under `supabase/migrations/`, applied to the hosted project via `supabase db push`. Seed data applied via the Supabase SQL Editor. Client utilities follow the official `@supabase/ssr` App Router pattern — one async server factory (reads Next.js 15+ async `cookies()`) and one browser factory (`"use client"` module for Client Components).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Tooling Bootstrap | Packages installed; CLI initialized, linked; `.env.example` | Supabase CLI must be installed locally; `supabase link` requires the project ref from the dashboard URL |
| 2. Schema Migration | `lesson_status` enum + 3 tables + RLS applied to hosted DB | SQL syntax error fails `supabase db push` silently — read the migration file before pushing |
| 3. Seed Data | 5 instructors + 8 students in hosted DB | Wrong category values won't surface until S-01 tests the filter; verify via dashboard |
| 4. Client Utilities | `server.ts` + `client.ts`; build passes | `cookies()` is async in Next.js 15+ — must `await` it or session reads silently return `undefined` |

**Prerequisites:** Hosted Supabase project created and accessible; Vercel CLI authenticated (`vercel env pull` requires project linked — `.vercel/` already present).
**Estimated effort:** ~1 focused session across 4 phases; Phase 1 is the only one requiring one-time browser auth flows (Supabase CLI login).

## Open Risks & Assumptions

- Placeholder instructor/student data must be replaced with real client data before launch (open question in `context/foundation/roadmap.md` — categories and names not yet confirmed with the school)
- RLS with no policies means anon-key queries return empty results — expected and correct; all F-01 verification uses the Supabase dashboard directly (service role via dashboard bypasses RLS)

## Success Criteria (Summary)

- `npm run build` and `npm run lint` both pass with exit 0
- Supabase dashboard shows 3 tables with correct schemas, 5 seeded instructors (all with non-null tokens), 8 seeded students, 0 lessons
- `src/lib/supabase/server.ts` and `client.ts` exist and compile cleanly
