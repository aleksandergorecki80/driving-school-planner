'use client'
import type { LessonRow } from './types'

interface Props {
  lesson: LessonRow
  gridRow: string   // e.g. "4 / 6"
  gridColumn: number
  onClick: () => void
}

export default function LessonBlock({ lesson, gridRow, gridColumn, onClick }: Props) {
  const studentName = lesson.students[0]?.name ?? 'Unknown'
  const colorClass =
    lesson.status === 'confirmed'
      ? 'bg-green-200 border-green-400'
      : 'bg-yellow-200 border-yellow-400'

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`m-0.5 overflow-hidden rounded border px-1 py-0.5 text-xs cursor-pointer z-10 ${colorClass}`}
      style={{ gridRow, gridColumn }}
    >
      <div className="truncate font-medium leading-tight">{studentName}</div>
      <div className="truncate text-zinc-600 leading-tight">{lesson.category}</div>
    </div>
  )
}
