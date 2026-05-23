# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Do not use FormEvent in React 19 forms

- **Context**: TypeScript React components with form handling in Next.js 16 / React 19.
- **Problem**: Agent used FormEvent which is deprecated in React 19 and triggers ts(6385).
- **Rule**: Do not use FormEvent. Use action prop on <form> element instead of onSubmit with FormEvent.
- **Applies to**: implement, impl-review
