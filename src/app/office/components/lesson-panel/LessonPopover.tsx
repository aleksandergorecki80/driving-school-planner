'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { cancelLesson, regenerateLessonToken } from '@/app/actions/lessons'
import { cn } from '@/lib/utils'
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
  const [overrideEmail, setOverrideEmail] = useState<string | undefined>(undefined)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  // AlertDialog defaults to portaling into document.body, which the vaul Drawer's
  // modal mode treats as "outside" and blocks with its own overlay — pointing the
  // portal container at this panel's own root (inside the drawer) fixes that. The
  // trigger below blocks pointer events until rootEl is set (see NewLessonForm's
  // rootEl comment for the full mechanism — Base UI's `disabled` prop alone doesn't
  // close this window, since it's enforced in the onClick handler rather than via the
  // native `disabled` attribute).
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
    startResendTransition(async () => {
      setError(null)
      const result = await regenerateLessonToken(lesson.id, overrideEmail)
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

        {lesson.status === 'rejected' && lesson.rejection_reason && (
          <DetailRow label="Rejection reason" value={lesson.rejection_reason} />
        )}

        {lesson.status === 'pending' && (
          <OverrideEmailField
            targetEmail={instructor.email}
            disabled={isResending}
            editAriaLabel="Send to a different email for this resend only"
            onOverrideChange={setOverrideEmail}
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
                  disabled={isPending || !rootEl}
                  className={cn(
                    lesson.status === 'pending' ? 'w-full' : 'mt-auto w-full',
                    !rootEl && 'pointer-events-none',
                  )}
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
