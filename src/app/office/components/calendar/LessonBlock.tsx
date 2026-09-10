'use client'
import type { LessonRow } from '../types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LESSON_STATUS } from '@/components/lesson/lesson-status'
import { formatLessonDateTime } from '@/lib/format-lesson-datetime'

interface Props {
  lesson: LessonRow
  gridRow: string   // e.g. "4 / 6"
  gridColumn: number
  onClick: () => void
}

export default function LessonBlock({ lesson, gridRow, gridColumn, onClick }: Props) {
  const studentName = lesson.students?.name ?? 'Unknown'
  const status = LESSON_STATUS[lesson.status]

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={`${studentName} – ${lesson.category} – ${status.label} – ${formatLessonDateTime(lesson.scheduled_at)}`}
      className={cn(
        'm-0.5 h-auto w-full cursor-pointer flex-col items-start justify-start gap-0.5 overflow-hidden rounded border px-1 py-0.5 text-xs text-left z-10',
        status.chipClassName,
      )}
      style={{ gridRow, gridColumn }}
    >
      <div className="w-full truncate font-medium leading-tight">{studentName}</div>
      <div className="flex w-full items-center justify-between gap-1">
        <span className="min-w-0 truncate leading-tight opacity-75">{lesson.category}</span>
        <Badge
          className={cn(
            'h-3.5 max-w-[55%] shrink-0 truncate rounded px-1 py-0 text-[10px] leading-tight',
            status.badgeClassName,
          )}
        >
          {status.label}
        </Badge>
      </div>
    </Button>
  )
}
