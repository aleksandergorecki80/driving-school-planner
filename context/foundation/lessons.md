# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Do not use FormEvent in React 19 forms

- **Context**: TypeScript React components with form handling in Next.js 16 / React 19.
- **Problem**: Agent used FormEvent which is deprecated in React 19 and triggers ts(6385).
- **Rule**: Do not use FormEvent. Use action prop on <form> element instead of onSubmit with FormEvent.
- **Applies to**: implement, impl-review

## FK columns without explicit ON DELETE default to RESTRICT

- **Context**: supabase/migrations — FK columns on the `lessons` table referencing `instructors` and `students`.
- **Problem**: No `ON DELETE` clause was specified, so PostgreSQL silently defaults to `RESTRICT`. Any future "deactivate instructor" or "remove student" flow will hit a foreign-key constraint error at runtime rather than failing clearly at schema design time.
- **Rule**: Always specify `ON DELETE` behavior explicitly on FK columns. Default to `RESTRICT` with a comment if that is intentional, or choose `CASCADE`/`SET NULL` deliberately. Never leave it implicit.
- **Applies to**: plan, implement — when writing any SQL migration that adds FK references.

## No non-null assertion operator (!) — use guard blocks with a descriptive error instead

- **Context**: Any TypeScript file in the project where a value may be `undefined` (env vars, query results, optional props).
- **Problem**: Non-null assertion (`!`) silences the TypeScript error with no runtime protection — when the value actually is `undefined`, the code crashes without any context about where or why.
- **Rule**: Do not use `!`. Instead write a guard block that throws a descriptive error: `if (!value) { throw new Error('Missing X — ...') }`. If TypeScript does not narrow the type through a closure, re-bind after the guard (`const validX = x`) — TypeScript infers `string` from the already-narrowed value.
- **Applies to**: implement, impl-review — every TS/TSX file in the project.

## Soft-delete users/instructors/students via deactivated_at, never hard-delete

- **Context**: Any migration or query touching users, instructors, or students tables.
- **Problem**: Attempting to hard-delete an instructor or student who has lesson rows raises a FK constraint error at runtime; the deactivation flow breaks silently or crashes.
- **Rule**: Users/instructors/students are never hard-deleted. Deactivation uses `deactivated_at TIMESTAMPTZ DEFAULT NULL` (NULL = active, timestamp = deactivated). All queries on active records must filter `WHERE deactivated_at IS NULL`. No ON DELETE CASCADE or RESTRICT issues — FK references remain valid.
- **Applies to**: plan, plan-review, implement, impl-review

## One server action per file

- **Context**: Any `'use server'` file under `src/app/actions/**` — server actions callable from client components.
- **Problem**: Multiple unrelated server actions piling up in one file (e.g. `lessons.ts` growing to hold `createLesson`, `cancelLesson`, `respondToLesson`, `regenerateLessonToken`) makes it harder to see each action's contract at a glance and to reason about what a given client component actually depends on.
- **Rule**: Each server action (endpoint) gets its own file, one exported function per file. Group related actions under a folder (e.g. `src/app/actions/lessons/`) with an `index.ts` barrel that re-exports them, so existing `from '@/app/actions/<group>'` import sites keep working unchanged.
- **Applies to**: implement, impl-review — any new or refactored `'use server'` file.

## Env var guards in files behind a barrel must be lazy, never module-level

- **Context**: Any file exporting a `'use server'` action (or anything else) that sits behind an `index.ts` barrel re-exporting multiple sibling files — e.g. `src/app/actions/lessons/*`.
- **Problem**: A production incident (2026-07-05) — `sendLessonLink.ts` and `createLesson.ts` had module-level `if (!envVar) throw ...` guards. Because the barrel re-exports every sibling file together, importing *any* single action (e.g. `cancelLesson`, which needs no email config at all) forces the whole module graph to evaluate, including `sendLessonLink.ts`'s guard. On Vercel, where `RESEND_API_KEY`/`EMAIL_FROM`/`NEXT_PUBLIC_APP_URL` weren't yet set, this crashed `/office` entirely with a generic 500 — a page that never touches email.
- **Rule**: Never put a throwing env-var guard at module scope in a file that a barrel re-exports, *or in any file that such a file imports at module scope* — the risk is transitive, not limited to the barreled file itself. (A follow-up impl-review caught exactly this: `anon.ts` was assumed exempt as "never barreled", but `respondToLesson.ts`, which *is* barreled, imported it at module scope, making its module-level guard reachable the same way.) Check the env var *inside* the function body and return a graceful `{ error }`/thrown-only-on-call-not-on-import instead — the module itself must always be safely importable regardless of which env vars are set. Only genuinely leaf files with no barreled importers (verify with a reverse-import check, not just "this file isn't in an index.ts") may keep the module-level throw-on-missing-var pattern.
- **Applies to**: implement, impl-review — any file added under a barreled directory (`src/app/actions/**/index.ts` siblings) or imported by one.

## Stop and wait after each branch+commit — don't chain into the next thing

- **Context**: Any workflow that creates a branch and commits to it (per "Every commit goes on its own branch, followed by a merge request") — TDD phase commits, impl-review fixes, doc updates, hotfixes.
- **Problem**: After committing and telling the user the branch is ready for a merge request, continuing straight on to other work (e.g. syncing `main`, starting the next phase's gate, running further checks) crowds out the user's chance to actually review/push/merge that branch before more happens. The commit being "ready for MR" is a natural pause point, not a checkpoint to blow through.
- **Rule**: The moment a branch + commit is made and ready for a merge request, stop working and tell the user it's ready — then wait for their reaction (push confirmation, "gotowe zmergowane", a correction, or a new instruction) before starting anything else, including syncing `main` or moving to the next unit of work.
- **Applies to**: implement, plan-review, impl-review — any skill or workflow step that ends in a commit.
