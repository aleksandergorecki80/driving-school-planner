'use client'
import type { LessonRow } from './types'

interface Props {
  lesson: LessonRow
  gridRow: string   // e.g. "4 / 6"
  gridColumn: number
  onClick: () => void
}

export default function LessonBlock({ lesson, gridRow, gridColumn, onClick }: Props) {
  const studentName = lesson.students?.name ?? 'Unknown'
  const colorClass =
    lesson.status === 'confirmed'
      ? 'bg-green-200 border-green-400 text-green-900'
      : 'bg-yellow-200 border-yellow-400 text-yellow-900'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={`${studentName} – ${lesson.category}`}
      className={`m-0.5 overflow-hidden rounded border px-1 py-0.5 text-xs cursor-pointer z-10 text-left w-full ${colorClass}`}
      style={{ gridRow, gridColumn }}
    >
      <div className="truncate font-medium leading-tight">{studentName}</div>
      <div className="truncate leading-tight opacity-75">{lesson.category}</div>
    </button>
  )
}
