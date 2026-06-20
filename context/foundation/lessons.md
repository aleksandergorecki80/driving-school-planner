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

## Soft-delete users/instructors/students via deactivated_at, never hard-delete

- **Context**: Any migration or query touching users, instructors, or students tables.
- **Problem**: Attempting to hard-delete an instructor or student who has lesson rows raises a FK constraint error at runtime; the deactivation flow breaks silently or crashes.
- **Rule**: Users/instructors/students are never hard-deleted. Deactivation uses `deactivated_at TIMESTAMPTZ DEFAULT NULL` (NULL = active, timestamp = deactivated). All queries on active records must filter `WHERE deactivated_at IS NULL`. No ON DELETE CASCADE or RESTRICT issues — FK references remain valid.
- **Applies to**: plan, plan-review, implement, impl-review
