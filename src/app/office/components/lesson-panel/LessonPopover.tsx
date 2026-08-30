'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { cancelLesson, regenerateLessonToken } from '@/app/actions/lessons'
import type { LessonRow } from '../types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { DetailRow } from '@/components/lesson/DetailRow'
import { OverrideEmailField } from '@/components/lesson/OverrideEmailField'
import { LESSON_STATUS } from '@/components/lesson/lesson-status'
import { formatLessonDateTime } from '@/lib/format-lesson-datetime'

interface Props {
  instructor: { name: string; email: string | null }
  lesson: LessonRow
  onClose: () => void
}

export default function LessonPopover({ instructor, lesson, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isResending, startResendTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [useOverrideEmail, setUseOverrideEmail] = useState(false)
  const [overrideEmail, setOverrideEmail] = useState('')
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  // AlertDialog defaults to portaling into document.body, which the vaul Drawer's
  // modal mode treats as "outside" and blocks with its own overlay — pointing the
  // portal container at this panel's own root (inside the drawer) fixes that.
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)

  const studentName = lesson.students?.name ?? 'Unknown'
  const status = LESSON_STATUS[lesson.status]

  function handleCancel() {
    setConfirmCancelOpen(false)
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
    <div ref={setRootEl} className="flex flex-col h-full">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Lesson Details</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X />
        </Button>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <DetailRow label="Instructor" value={instructor.name} />
        <DetailRow label="Student" value={studentName} />
        <DetailRow label="Category" value={lesson.category} />
        <DetailRow label="Scheduled" value={formatLessonDateTime(lesson.scheduled_at)} />

        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <Badge className={status.badgeClassName}>{status.label}</Badge>
        </div>

        {lesson.status === 'pending' && (
          <OverrideEmailField
            targetEmail={instructor.email}
            checked={useOverrideEmail}
            onCheckedChange={setUseOverrideEmail}
            disabled={isResending}
            checkboxLabel="Send to a different email for this resend only"
            inputValue={overrideEmail}
            onInputChange={setOverrideEmail}
          />
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

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
          <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending}
                  className={lesson.status === 'pending' ? 'w-full' : 'mt-auto w-full'}
                >
                  {isPending ? 'Cancelling…' : 'Cancel lesson'}
                </Button>
              }
            />
            <AlertDialogContent container={rootEl}>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this lesson?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cancels the lesson and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep lesson</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleCancel}>
                  Yes, cancel lesson
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  )
}
