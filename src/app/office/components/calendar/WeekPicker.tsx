'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface Props {
  weekStart: Date
  weekLabel: string
  onSelect: (date: Date) => void
}

// weekStart is a UTC-midnight Date (this app's date convention), but
// react-day-picker compares/selects days in the browser's local timezone.
// Re-anchor the same calendar day (Y/M/D) to local midnight so the
// currently-displayed week highlights correctly regardless of UTC offset.
function toLocalMidnight(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// Inverse of toLocalMidnight: react-day-picker returns a local-midnight
// Date; re-anchor it to UTC midnight for the same calendar day so it flows
// correctly into this app's UTC-based date handling (parseWeekStart,
// toISODate, goToWeek). Without this, a local offset ahead of UTC (e.g.
// UTC+2) can shift the picked day back by one calendar day once converted
// via .toISOString(), which then snaps to the wrong Monday.
function toUTCMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export default function WeekPicker({ weekStart, weekLabel, onSelect }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="w-44">
            {weekLabel}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          weekStartsOn={1}
          selected={toLocalMidnight(weekStart)}
          onSelect={(date) => {
            if (!date) return
            setOpen(false)
            onSelect(toUTCMidnight(date))
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
