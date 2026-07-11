'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelLesson, regenerateLessonToken } from '@/app/actions/lessons'
import type { LessonRow } from '../types'
import { Button } from '@/components/ui/button'

interface Props {
  instructor: { name: string; email: string | null }
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
  const [isResending, startResendTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [useOverrideEmail, setUseOverrideEmail] = useState(false)
  const [overrideEmail, setOverrideEmail] = useState('')

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

  function handleResend() {
    const trimmedOverride = useOverrideEmail ? overrideEmail.trim() : ''
    startResendTransition(async () => {
      setError(null)
      const result = await regenerateLessonToken(
        lesson.id,
        trimmedOverride || undefined,
      )
      if (result.error) {
        setError(result.error)
      } else if (result.warning) {
        setError(result.warning)
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
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close panel"
          className="text-zinc-400 hover:text-zinc-700"
        >
          ✕
        </Button>
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

        {lesson.status === 'pending' && (
          <div>
            <p className="text-xs text-zinc-500">Link will be sent to</p>
            <p className="text-sm font-medium text-zinc-900">
              {instructor.email ?? 'No email on file'}
            </p>
            <label className="mt-1 flex items-center gap-1.5 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={useOverrideEmail}
                onChange={(e) => setUseOverrideEmail(e.target.checked)}
                disabled={isResending}
              />
              Send to a different email for this resend only
            </label>
            {useOverrideEmail && (
              <input
                type="email"
                value={overrideEmail}
                onChange={(e) => setOverrideEmail(e.target.value)}
                placeholder="one-off@example.com"
                disabled={isResending}
                className="mt-1.5 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
              />
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {lesson.status === 'pending' && (
          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={isResending}
            className="mt-auto w-full"
          >
            {isResending ? 'Resending…' : 'Resend link'}
          </Button>
        )}

        {lesson.status !== 'rejected' && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleCancel}
            disabled={isPending}
            className={lesson.status === 'pending' ? 'w-full' : 'mt-auto w-full'}
          >
            {isPending ? 'Cancelling…' : 'Cancel lesson'}
          </Button>
        )}
      </div>
    </div>
  )
}
