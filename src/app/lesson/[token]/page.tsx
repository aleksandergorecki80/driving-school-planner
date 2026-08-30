import type { Metadata } from 'next'
import { createAnonClient } from '@/lib/supabase/anon'
import { DetailRow } from '@/components/lesson/DetailRow'
import { ThemeToggle } from '@/components/theme-toggle'
import { formatLessonDateTime } from '@/lib/format-lesson-datetime'
import LessonResponseForm from './components/LessonResponseForm'

export const metadata: Metadata = {
  title: 'Lesson Response — DrivePlan',
}

interface Props {
  params: Promise<{ token: string }>
}

export default async function LessonPage({ params }: Props) {
  const { token } = await params

  const anon = createAnonClient()
  // A malformed (non-UUID) token makes this RPC call return an error rather than an
  // empty result — destructuring only `data` treats both cases the same way: not valid.
  const { data } = await anon.rpc('get_lesson_by_token', { p_token: token })
  const lesson = data?.[0]

  if (!lesson) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-sm text-zinc-600">This link is no longer valid.</p>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen flex-col gap-4 p-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <h1 className="text-lg font-semibold text-foreground">Lesson details</h1>

      <DetailRow label="Student" value={lesson.student_name} />
      <DetailRow label="Category" value={lesson.category} />
      <DetailRow label="Scheduled" value={formatLessonDateTime(lesson.scheduled_at)} />

      <LessonResponseForm
        token={token}
        scheduledAt={lesson.scheduled_at}
        category={lesson.category}
      />
    </main>
  )
}
