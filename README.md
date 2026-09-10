## About

**DrivePlan** is a lesson-scheduling web app for driving schools. It replaces the
phone/SMS coordination between office staff and instructors with a shared,
durable scheduling record.

- **Office staff** log in with a shared account and book lessons: pick a licence
  category (B, C, D, T…), choose an instructor who holds that category, pick a
  date/time, and attach a student from the pre-seeded roster. The lesson is
  created with status `pending`.
- **Instructors** have no login. Each instructor gets a unique tokenized URL
  (e.g. `/lesson/[token]`) emailed to them, showing only their own calendar.
  From there they approve or reject each pending lesson; a rejection requires a
  short reason, which can optionally be AI-suggested.
- Status changes (`pending` → `confirmed` / `rejected`) are picked up by the
  office view via polling — no manual reload, no push infrastructure.

### Data flow

1. **Office UI** (`src/app/office`) calls **Server Actions**
   (`src/app/actions/lessons`) to create, cancel, or regenerate the token for a
   lesson — no client-side REST calls for mutations.
2. Server Actions operate on **domain logic** in `src/domain/lesson`
   (`Lesson`, `LessonRepository`), which enforces the core business rule:
   a lesson can only be created for an instructor who holds the lesson's
   licence category, with students filtered the same way.
3. The repository persists through **Supabase** (PostgreSQL) using
   `src/lib/supabase` clients; Supabase Auth backs the office's session.
4. On lesson creation, `src/lib/email/sendLessonLink.ts` emails the instructor
   their tokenized lesson-view link.
5. The **instructor view** (`src/app/lesson/[token]`) reads and mutates lesson
   state via `respondToLesson` using only the URL token — no login. Rejection
   reasons can be generated through `src/lib/ai/suggestRejectionReasons.ts`.
6. The **office view** re-polls lesson status on an interval, so approvals/
   rejections made by instructors surface without a manual refresh.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
