'use client'
import type { LessonRow } from '../types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { LESSON_STATUS } from '@/components/lesson/lesson-status'

interface Props {
  lesson: LessonRow
  gridRow: string   // e.g. "4 / 6"
  gridColumn: number
  onClick: () => void
}

export default function LessonBlock({ lesson, gridRow, gridColumn, onClick }: Props) {
  const studentName = lesson.students?.name ?? 'Unknown'
  const colorClass = LESSON_STATUS[lesson.status].chipClassName

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={`${studentName} – ${lesson.category}`}
      className={cn(
        'm-0.5 h-auto w-full cursor-pointer justify-start overflow-hidden rounded border px-1 py-0.5 text-xs text-left z-10',
        colorClass,
      )}
      style={{ gridRow, gridColumn }}
    >
      <div className="truncate font-medium leading-tight">{studentName}</div>
      <div className="truncate leading-tight opacity-75">{lesson.category}</div>
    </Button>
  )
}
