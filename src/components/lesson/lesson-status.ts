export type LessonStatus = 'pending' | 'confirmed' | 'rejected'

// No semantic "warning"/"success" token exists in globals.css (only
// --destructive) — status coloring stays on Tailwind's built-in palette with
// explicit dark: variants rather than shadcn theme tokens.
export const LESSON_STATUS: Record<
  LessonStatus,
  { label: string; chipClassName: string; badgeClassName: string }
> = {
  pending: {
    label: 'Pending',
    chipClassName:
      'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
    badgeClassName:
      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  },
  confirmed: {
    label: 'Confirmed',
    chipClassName:
      'border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200',
    badgeClassName:
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  },
  rejected: {
    label: 'Rejected',
    chipClassName:
      'border-red-400 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
    badgeClassName:
      'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  },
}
