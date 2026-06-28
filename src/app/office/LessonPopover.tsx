'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelLesson } from '@/app/actions/lessons'
import type { LessonRow } from './types'

interface Props {
  instructor: { name: string }
  lesson: LessonRow
  onClose: () => void
}

// 'cancelled' excluded from status — page.tsx filters .neq('status', 'cancelled') before passing to components.
const STATUS_LABELS: Record<LessonRow['status'], string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
}

const STATUS_COLORS: Record<LessonRow['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-900',
  confirmed: 'bg-green-100 text-green-900',
  rejected: 'bg-red-100 text-red-900',
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

export default function LessonPopover({ instructor, lesson, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const studentName = lesson.students?.name ?? 'Unknown'

  function handleCancel() {
    startTransition(async () => {
      setError(null)
      const result = await cancelLesson(lesson.id)
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
        onClose()
      }
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">Lesson Details</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="text-zinc-400 hover:text-zinc-700"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <div>
          <p className="text-xs text-zinc-500">Instructor</p>
          <p className="text-sm font-medium text-zinc-900">{instructor.name}</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500">Student</p>
          <p className="text-sm font-medium text-zinc-900">{studentName}</p>
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

        <div>
          <p className="text-xs text-zinc-500">Status</p>
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[lesson.status]}`}
          >
            {STATUS_LABELS[lesson.status]}
          </span>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {lesson.status !== 'rejected' && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            className="mt-auto rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {isPending ? 'Cancelling…' : 'Cancel lesson'}
          </button>
        )}
      </div>
    </div>
  )
}
