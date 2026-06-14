# Supabase Data Foundation (F-01) Implementation Plan

## Overview

Wire `@supabase/supabase-js` + `@supabase/ssr` into the Next.js 16 project, initialize the Supabase CLI project structure, create the initial database schema (`instructors`, `students`, `lessons`), seed placeholder data, and expose two Supabase client utilities (`server.ts` and `client.ts`) that all downstream slices (F-02, S-01, S-02) will import.

## Current State Analysis

The project is a clean Next.js 16.2.6 scaffold:
- No Supabase packages installed (`package.json` has only `next`, `react`, `react-dom`)
- No environment files (`.env.local`, `.env.example`)
- No Supabase CLI initialization (`supabase/` directory absent)
- No database schema or seed files
- No middleware, no API routes, no server actions
- TypeScript strict mode on; path alias `@/*` → `src/*` configured in `tsconfig.json`
- Vercel CLI installed as a dev dependency; project linked to Vercel (`.vercel/` present)

Infrastructure docs (`context/foundation/infrastructure.md`) specify all required env var names and call out the transaction-mode connection URL requirement.

## Desired End State

After this plan is complete:
- `@supabase/supabase-js` and `@supabase/ssr` are listed in `package.json` dependencies
- `supabase/` directory exists, initialized and linked to the hosted Supabase project
- One migration file in `supabase/migrations/` defines the complete schema: `lesson_status` enum, `instructors`, `students`, and `lessons` tables with FK constraints and RLS enabled
- `supabase/seed.sql` contains placeholder instructors (5 records with categories and auto-generated tokens) and students (8 records with names, phones, categories)
- Migration and seed data are applied to the hosted Supabase project
- `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts` exist and compile without errors
- `.env.example` documents all 4 required env vars
- `npm run build` passes cleanly

**Verify**: `npm run build` exits 0; Supabase dashboard → Table Editor shows 3 tables with data; `SELECT name, token FROM instructors ORDER BY name` returns 5 rows with non-null tokens.

### Key Discoveries:

- `package.json` has no Supabase packages — both must be added as production dependencies
- Infrastructure docs already specify all 4 env var names and strongly recommend transaction-mode port 6543 for `DATABASE_URL` (see infrastructure.md risk register item #1)
- `cookies()` from `next/headers` is async in Next.js 15+ — the server client factory must be `async` and `await` the cookie store
- No existing middleware or auth patterns — F-01 is the baseline; F-02 builds directly on top
- Service role key bypasses RLS automatically in Supabase — no explicit policies needed in F-01; F-02 adds fine-grained office/instructor access policies

## What We're NOT Doing

- No API routes, route handlers, or server actions (S-01)
- No auth middleware (F-02)
- No service-role client utility file (F-02/S-01 add it when first needed)
- No local Docker-based Supabase development (hosted-only workflow throughout)
- No TypeScript type generation (`supabase gen types typescript` — run on-demand when F-02 starts)
- No lesson seed records (lessons are created by the office in S-01)
- No DB-level category-coherence constraint (application-enforced via UI filtering in S-01)

## Implementation Approach

Install packages and initialize the Supabase CLI project structure first (Phase 1) so that `supabase migration new` creates correctly timestamped files. Write the schema migration next (Phase 2) and apply it to the hosted project. Write and apply the seed data (Phase 3). Finally, create the two client utility files and confirm the full stack compiles (Phase 4). Each phase's output is independently verifiable before proceeding to the next.

## Critical Implementation Details

**`cookies()` is async in Next.js 15+.** The `server.ts` client factory must be declared `async` and must `await cookies()`. Calling `cookies()` synchronously in Next.js 15+ returns a Promise object rather than the cookie store — any session read silently returns `undefined` instead of throwing, making the bug invisible until auth is wired in F-02.

```typescript
// server.ts — required function shape
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(/* ... */)
}
```

**Use the transaction-mode Supabase URL for `DATABASE_URL`.** The Supabase dashboard shows port 5432 (session mode) as the default connection string. For Vercel serverless invocations set `DATABASE_URL` to the Supavisor transaction-mode URL (port 6543). See `context/foundation/infrastructure.md` risk register item #1.

---

## Phase 1: Tooling Bootstrap

### Overview

Install the two Supabase npm packages, initialize the Supabase CLI project structure, link it to the hosted project, and create `.env.example` documenting the four required env vars.

### Changes Required:

#### 1. Install Supabase npm packages

**File**: `package.json` (modified by `npm install`)

**Intent**: Add `@supabase/supabase-js` and `@supabase/ssr` as production dependencies so the project can connect to Supabase from both server and browser contexts.

**Contract**: Run `npm install @supabase/supabase-js @supabase/ssr` from the project root. Both packages appear under `"dependencies"` in `package.json` after the command.

---

#### 2. Initialize and link the Supabase CLI project

**File**: `supabase/config.toml` (created by `supabase init`)

**Intent**: Create the local Supabase project structure so migration files are version-controlled alongside source code. Linking to the hosted project enables `supabase db push` to apply migrations to the right target.

**Contract**: Three commands in sequence:
1. `supabase init` — creates `supabase/config.toml` and `supabase/.gitignore`
2. `supabase login` — one-time browser authentication flow
3. `supabase link --project-ref <project-ref>` — `<project-ref>` is the string in the Supabase dashboard URL: `https://supabase.com/dashboard/project/<project-ref>`

---

#### 3. Create `.env.example`

**File**: `.env.example`

**Intent**: Document all required environment variables so any developer or new environment knows what to provision. This file is committed to git; `.env.local` is gitignored.

**Contract**: Four entries with comments:

```
# Supabase project URL — Supabase dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=

# Supabase anon/public key — Supabase dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase service role key — server-only, never expose to the browser
# Supabase dashboard → Project Settings → API → Service role key
SUPABASE_SERVICE_ROLE_KEY=

# Supabase Supavisor transaction-mode URL (port 6543, NOT session-mode port 5432)
# Supabase dashboard → Project Settings → Database → Connection string → Transaction mode
DATABASE_URL=
```

---

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0 (packages installed, no import errors introduced)
- `supabase --version` prints a version string
- `supabase/config.toml` exists at repo root

#### Manual Verification:

- `supabase/config.toml` contains the correct `project-id` for the hosted project (confirms `supabase link` targeted the right project)
- `.env.example` committed to git with all 4 entries and correct comments

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: Schema Migration

### Overview

Create the initial SQL migration file defining the `lesson_status` enum, three tables with FK constraints, and RLS enabled on all tables. Apply the migration to the hosted Supabase project.

### Changes Required:

#### 1. Create the initial schema migration file

**File**: `supabase/migrations/<timestamp>_initial_schema.sql` — created via `supabase migration new initial_schema`

**Intent**: Define the complete domain model in a single migration: the `lesson_status` enum, `instructors` (with `categories` array and auto-generated `token`), `students` (with enrolled `category`), and `lessons` (FK to both, denormalized `category`, enum `status`, nullable `rejection_reason`). Enable RLS on all three tables.

**Contract**: The migration must define the following, in this order:

1. `lesson_status` custom enum with values `'pending'`, `'confirmed'`, `'rejected'`
2. `instructors` table:
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `name text NOT NULL`
   - `categories text[] NOT NULL`
   - `token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE`
   - `created_at timestamptz NOT NULL DEFAULT now()`
3. `students` table:
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `name text NOT NULL`
   - `phone text NOT NULL`
   - `category text NOT NULL`
   - `created_at timestamptz NOT NULL DEFAULT now()`
4. `lessons` table:
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `instructor_id uuid NOT NULL REFERENCES instructors(id)`
   - `student_id uuid NOT NULL REFERENCES students(id)`
   - `category text NOT NULL` (denormalized — the category the office selected at creation time)
   - `scheduled_at timestamptz NOT NULL`
   - `status lesson_status NOT NULL DEFAULT 'pending'`
   - `rejection_reason text` (nullable — populated only on rejection)
   - `created_at timestamptz NOT NULL DEFAULT now()`
5. `ALTER TABLE instructors ENABLE ROW LEVEL SECURITY`
6. `ALTER TABLE students ENABLE ROW LEVEL SECURITY`
7. `ALTER TABLE lessons ENABLE ROW LEVEL SECURITY`

No RLS policies in this migration — the service role key used by all server-side code bypasses RLS automatically. F-02 adds authenticated and token-based access policies.

---

#### 2. Apply the migration to the hosted project

**File**: no source file change — CLI command only

**Intent**: Push pending migrations to the linked Supabase project so the schema exists in the hosted database before seed data is written.

**Contract**: `supabase db push` — applies all unapplied migrations in `supabase/migrations/` to the linked project.

---

### Success Criteria:

#### Automated Verification:

- `supabase db push` exits 0
- `supabase migration list` shows the migration with status `applied`

#### Manual Verification:

- Supabase dashboard → Table Editor shows `instructors`, `students`, `lessons` tables
- `instructors` has `categories` column of type `_text` (array) and `token` of type `uuid`
- `lessons` has `status` of type `lesson_status` (enum) and nullable `rejection_reason`
- Supabase dashboard → Authentication → Policies shows RLS enabled on all 3 tables

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 3.

---

## Phase 3: Seed Data

### Overview

Write placeholder seed data for instructors and students. Apply it to the hosted Supabase project. No lesson records — those are created by the office in S-01.

### Changes Required:

#### 1. Create `supabase/seed.sql`

**File**: `supabase/seed.sql`

**Intent**: Seed the hosted database with placeholder data that covers all licence categories (B, C, D, T, B+E, C+E) across instructors and distributes students across categories so that filter behavior in S-01 and S-02 can be tested with realistic variety. Instructor `token` is omitted from the INSERT — the column default (`gen_random_uuid()`) populates it automatically.

**Contract**: 5 instructor rows covering the full category spread; 8 student rows with at least 2 per commonly-tested category (B, C). Row shapes:

```sql
INSERT INTO instructors (name, categories) VALUES
  ('Jan Kowalski',      ARRAY['B']),
  ('Anna Nowak',        ARRAY['B', 'C']),
  ('Piotr Wiśniewski',  ARRAY['C', 'D', 'C+E']),
  ('Maria Dąbrowska',   ARRAY['B', 'T']),
  ('Tomasz Zając',      ARRAY['B+E', 'C+E']);

INSERT INTO students (name, phone, category) VALUES
  ('Adam Wójcik',          '+48 111 222 333', 'B'),
  ('Karolina Lewandowska', '+48 222 333 444', 'B'),
  ('Michał Kowalczyk',     '+48 333 444 555', 'B'),
  ('Agnieszka Kamińska',   '+48 444 555 666', 'C'),
  ('Rafał Zieliński',      '+48 555 666 777', 'C'),
  ('Justyna Woźniak',      '+48 666 777 888', 'D'),
  ('Łukasz Szymański',     '+48 777 888 999', 'B+E'),
  ('Natalia Piotrowska',   '+48 888 999 000', 'T');
```

---

#### 2. Apply seed to the hosted project

**File**: no source file change — executed via Supabase SQL Editor

**Intent**: Populate the hosted database with the placeholder records so S-01 development can begin with real-looking data.

**Contract**: Open Supabase dashboard → SQL Editor, paste the full contents of `supabase/seed.sql`, and click Run. (Alternatively: `psql "<session-mode-connection-string>" -f supabase/seed.sql` using the port-5432 connection string from Supabase dashboard → Project Settings → Database — the session-mode URL is correct for direct psql connections; the transaction-mode URL is only needed for Vercel serverless.)

---

### Success Criteria:

#### Manual Verification:

- Supabase dashboard → Table Editor → `instructors`: 5 rows visible; `token` column is populated (non-null UUID) for all rows
- Supabase dashboard → Table Editor → `students`: 8 rows visible with name, phone, category
- Supabase dashboard → Table Editor → `lessons`: 0 rows (empty)
- At least 3 students have `category = 'B'` — the most common test category for S-01

**Implementation Note**: After completing this phase and all manual verification passes, pause here for manual confirmation from the human before proceeding to Phase 4.

---

## Phase 4: Client Utilities and Verification

### Overview

Create the two Supabase client utility files (`server.ts` for Server Components and Route Handlers; `client.ts` for Client Components). Pull local env vars from Vercel. Confirm the full project compiles without errors.

### Changes Required:

#### 1. Create `src/lib/supabase/server.ts`

**File**: `src/lib/supabase/server.ts`

**Intent**: Expose an async factory `createClient()` returning a Supabase server client that reads and writes the Next.js cookie store. Every Server Component, Route Handler, and Server Action in F-02, S-01, and S-02 imports from this file.

**Contract**: `async function createClient()` that `await`s `cookies()` from `next/headers`, then calls `createServerClient` from `@supabase/ssr` with a cookie adapter object. The function is `async` because `cookies()` is async in Next.js 15+ (see Critical Implementation Details). Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `process.env`. No `"use client"` directive — server-only module.

---

#### 2. Create `src/lib/supabase/client.ts`

**File**: `src/lib/supabase/client.ts`

**Intent**: Expose a factory `createClient()` returning a Supabase browser client for use in Client Components. Used for the 30-second polling in S-02 and any other browser-side Supabase calls.

**Contract**: `"use client"` directive at the top of the file. `function createClient()` (synchronous) calling `createBrowserClient` from `@supabase/ssr` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

#### 3. Pull env vars from Vercel and run build

**File**: `.env.local` (created locally, gitignored)

**Intent**: Provision the local development environment with real Supabase credentials so the build resolves `process.env.NEXT_PUBLIC_SUPABASE_URL` and TypeScript compiles both client files without errors.

**Contract**: `vercel env pull .env.local` — pulls Production env vars into `.env.local`. Then `npm run build` and `npm run lint` must both exit 0.

---

### Success Criteria:

#### Automated Verification:

- `npm run build` exits 0
- `npm run lint` exits 0
- `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts` both exist

#### Manual Verification:

- `.env.local` exists locally and contains all 4 env vars from `.env.example` with real values
- Supabase dashboard confirms complete schema (3 tables, enum type visible) and seed data intact — final end-to-end confirmation

**Implementation Note**: After completing this phase and all automated and manual verification passes, pause here for final confirmation from the human. F-01 is complete.

---

## Testing Strategy

### Unit Tests:

No unit tests in scope for F-01 — the client utilities are thin wrappers around the Supabase SDK; the schema and seed are verified via direct database inspection.

### Integration Tests:

Not configured. When a test runner is added (per `AGENTS.md`: co-locate as `*.test.ts`), the first integration test would be a round-trip: `createClient()` server-side → `SELECT 1 FROM instructors LIMIT 1` → assert non-null result.

### Manual Testing Steps:

1. Open Supabase dashboard → Table Editor; verify all 3 tables with correct column shapes
2. Confirm `instructors.token` is populated (UUID, non-null) for all 5 seeded rows
3. Confirm `lessons` table is empty
4. Run `npm run build` locally; confirm exit 0 with no TypeScript errors
5. Confirm `.env.example` is committed to git and `.env.local` does not appear in `git status`

## Migration Notes

This is the initial schema — no existing data to migrate. Rollback for the hosted project: drop tables and the enum type via Supabase dashboard → SQL Editor if a full reset is needed. Subsequent schema changes (F-02: RLS policies; S-01: indexes if needed) each get their own migration file via `supabase migration new <name>`.

## References

- Roadmap F-01 full spec: `context/foundation/roadmap.md` lines 50–63
- PRD domain model and business logic: `context/foundation/prd.md`
- Infrastructure risk register (connection URL, env var setup): `context/foundation/infrastructure.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Tooling Bootstrap

#### Automated

- [x] 1.1 `npm run build` exits 0 after package install
- [x] 1.2 `supabase --version` prints a version string
- [x] 1.3 `supabase/config.toml` exists at repo root

#### Manual

- [ ] 1.4 `supabase/config.toml` contains the correct project-id for the hosted project
- [ ] 1.5 `.env.example` committed to git with all 4 entries and correct comments

### Phase 2: Schema Migration

#### Automated

- [x] 2.1 `supabase db push` exits 0
- [x] 2.2 `supabase migration list` shows migration as `applied`

#### Manual

- [x] 2.3 Supabase dashboard shows `instructors`, `students`, `lessons` tables with correct column types
- [x] 2.4 RLS enabled on all 3 tables (Supabase dashboard → Authentication → Policies)

### Phase 3: Seed Data

#### Manual

- [x] 3.1 `instructors` table: 5 rows with non-null `token` for all rows
- [x] 3.2 `students` table: 8 rows with name, phone, category
- [x] 3.3 `lessons` table: 0 rows

### Phase 4: Client Utilities and Verification

#### Automated

- [x] 4.1 `npm run build` exits 0 — ebc175a
- [x] 4.2 `npm run lint` exits 0 — ebc175a
- [x] 4.3 `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts` both exist — ebc175a

#### Manual

- [x] 4.4 `.env.local` contains all 4 env vars with real values — ebc175a
- [x] 4.5 Supabase dashboard confirms complete schema and seed data — ebc175a
