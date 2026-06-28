'use client'
import type { LessonRow } from './types'
import LessonBlock from './LessonBlock'

const SLOT_START_HOUR = 7
const SLOT_COUNT = 28  // 07:00–20:30 in 30-min steps

const SLOT_LABELS = Array.from({ length: SLOT_COUNT }, (_, i) => {
  const h = SLOT_START_HOUR + Math.floor(i / 2)
  const m = i % 2 === 0 ? '00' : '30'
  return `${h.toString().padStart(2, '0')}:${m}`
})

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  days: Date[]
  lessons: LessonRow[]
  onSlotClick: (date: Date) => void
  onLessonClick: (lesson: LessonRow) => void
}

export default function CalendarGrid({ days, lessons, onSlotClick, onLessonClick }: Props) {
  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateColumns: '4rem repeat(7, 1fr)',
        gridTemplateRows: `2.5rem repeat(${SLOT_COUNT}, 2rem)`,
      }}
    >
      {/* Corner cell */}
      <div className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-white" />

      {/* Day headers — sticky, row 1, columns 2–8 */}
      {days.map((day, i) => (
        <div
          key={i}
          className="sticky top-0 z-20 flex items-center justify-center border-b border-r border-zinc-200 bg-white text-xs font-medium text-zinc-600"
          style={{ gridRow: 1, gridColumn: i + 2 }}
        >
          {DAY_NAMES[i]}{' '}
          {day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
        </div>
      ))}

      {/* Time labels — column 1, rows 2–29 */}
      {SLOT_LABELS.map((label, i) => (
        <div
          key={label}
          className="flex items-start justify-end border-b border-r border-zinc-100 pr-2 pt-0.5 text-xs text-zinc-400"
          style={{ gridRow: i + 2, gridColumn: 1 }}
        >
          {label}
        </div>
      ))}

      {/* Empty slot cells — columns 2–8, rows 2–29 */}
      {days.map((day, colIdx) =>
        Array.from({ length: SLOT_COUNT }, (_, rowIdx) => {
          const offsetMs = (SLOT_START_HOUR * 60 + rowIdx * 30) * 60 * 1000
          const slotDate = new Date(day.getTime() + offsetMs)
          return (
            <div
              key={`${colIdx}-${rowIdx}`}
              onClick={() => onSlotClick(slotDate)}
              aria-label={`${DAY_NAMES[colIdx]} ${SLOT_LABELS[rowIdx]}`}
              className="cursor-pointer border-b border-r border-zinc-100 hover:bg-zinc-50"
              style={{ gridRow: rowIdx + 2, gridColumn: colIdx + 2 }}
            />
          )
        }),
      )}

      {/* Lesson blocks — overlaid as sibling grid items */}
      {lessons.map((lesson) => {
        const dt = new Date(lesson.scheduled_at)
        const hours = dt.getUTCHours()
        const minutes = dt.getUTCMinutes()
        const slotIndex = (hours - SLOT_START_HOUR) * 2 + Math.floor(minutes / 30)

        if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return null

        const dayOfWeekMonday0 = (dt.getUTCDay() + 6) % 7
        const gridRow = `${slotIndex + 2} / ${slotIndex + 4}`
        const gridColumn = dayOfWeekMonday0 + 2

        return (
          <LessonBlock
            key={lesson.id}
            lesson={lesson}
            gridRow={gridRow}
            gridColumn={gridColumn}
            onClick={() => onLessonClick(lesson)}
          />
        )
      })}
    </div>
  )
}
