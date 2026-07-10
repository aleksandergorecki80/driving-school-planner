import type { Metadata } from 'next'
import { createAnonClient } from '@/lib/supabase/anon'
import LessonResponseForm from './components/LessonResponseForm'

export const metadata: Metadata = {
  title: 'Lesson Response — DrivePlan',
}

interface Props {
  params: Promise<{ token: string }>
}

function formatScheduledAt(scheduledAt: string): string {
  const dt = new Date(scheduledAt)
  const date = dt.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const time = dt.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  return `${date} at ${time}`
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
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-zinc-900">Lesson details</h1>

      <div>
        <p className="text-xs text-zinc-500">Student</p>
        <p className="text-sm font-medium text-zinc-900">{lesson.student_name}</p>
      </div>

      <div>
        <p className="text-xs text-zinc-500">Category</p>
        <p className="text-sm font-medium text-zinc-900">{lesson.category}</p>
      </div>

      <div>
        <p className="text-xs text-zinc-500">Scheduled</p>
        <p className="text-sm font-medium text-zinc-900">
          {formatScheduledAt(lesson.scheduled_at)}
        </p>
      </div>

      <LessonResponseForm
        token={token}
        scheduledAt={lesson.scheduled_at}
        category={lesson.category}
      />
    </main>
  )
}
