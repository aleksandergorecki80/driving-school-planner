'use client'
import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LessonRow } from '../types'
import CalendarGrid from './CalendarGrid'
import WeekPicker from './WeekPicker'
import { Button } from '@/components/ui/button'

interface Props {
  instructor: { id: string; name: string }
  lessons: LessonRow[]
  weekStart: string  // YYYY-MM-DD (UTC Monday)
  onSlotClick?: (date: Date) => void
  onLessonClick?: (lesson: LessonRow) => void
}

function parseWeekStart(s: string): Date {
  return new Date(s + 'T00:00:00.000Z')
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
  const dayMonthFmt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' }
  const start = weekStart.toLocaleDateString('en-GB', dayMonthFmt)
  const end = weekEnd.toLocaleDateString('en-GB', { ...dayMonthFmt, year: 'numeric' })
  return `${start} – ${end}`
}

export default function WeeklyCalendar({
  instructor,
  lessons,
  weekStart: weekStartStr,
  onSlotClick = () => {},
  onLessonClick = () => {},
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [direction, setDirection] = useState<'forward' | 'backward' | null>(null)
  const [isPending, startTransition] = useTransition()

  const weekStart = parseWeekStart(weekStartStr)
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000),
  )

  function goToWeek(newStart: Date) {
    setDirection(newStart > weekStart ? 'forward' : newStart < weekStart ? 'backward' : null)
    const params = new URLSearchParams(searchParams.toString())
    params.set('week', toISODate(newStart))
    startTransition(() => {
      router.push(`/office?${params.toString()}`)
    })
  }

  function navigateWeek(delta: number) {
    goToWeek(new Date(weekStart.getTime() + delta * 7 * 24 * 60 * 60 * 1000))
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Week navigation bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <span className="text-sm font-semibold text-foreground">{instructor.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigateWeek(-1)}
            disabled={isPending}
          >
            <ChevronLeft /> Prev
          </Button>
          <WeekPicker weekStart={weekStart} weekLabel={formatWeekLabel(weekStart)} onSelect={goToWeek} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigateWeek(1)}
            disabled={isPending}
          >
            Next <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Scrollable calendar grid */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <CalendarGrid
          key={weekStartStr}
          days={days}
          lessons={lessons}
          direction={direction}
          onSlotClick={onSlotClick}
          onLessonClick={onLessonClick}
        />
      </div>
    </div>
  )
}
