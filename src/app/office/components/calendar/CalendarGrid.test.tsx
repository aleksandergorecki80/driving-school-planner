// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { toast } from 'sonner'
import * as officeTime from '@/lib/office-time'
import CalendarGrid from './CalendarGrid'
import { NOW_LINE_TICK_MS } from './now-line'

vi.mock('sonner', () => ({ toast: vi.fn() }))

const NOW = new Date('2050-06-15T12:00:00.000Z')
const day = new Date('2050-06-15T00:00:00.000Z')

describe('CalendarGrid — past slot click-guard', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.mocked(toast).mockClear()
  })

  it('does not call onSlotClick, but shows a toast, for a slot whose time has already passed today', () => {
    vi.spyOn(officeTime, 'officeNowAsNaiveUTC').mockReturnValue(NOW)

    const onSlotClick = vi.fn()
    const { getByLabelText } = render(
      <CalendarGrid days={[day]} lessons={[]} onSlotClick={onSlotClick} onLessonClick={vi.fn()} />,
    )

    const pastSlot = getByLabelText('Mon 07:00')
    expect(pastSlot.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(pastSlot)
    expect(onSlotClick).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(
      'Cannot schedule a lesson in the past',
      expect.objectContaining({
        id: 'past-slot-click',
        cancel: expect.objectContaining({ label: '✕' }),
      }),
    )
  })

  it('calls onSlotClick, and does not show a toast, for a slot later today', () => {
    vi.spyOn(officeTime, 'officeNowAsNaiveUTC').mockReturnValue(NOW)

    const onSlotClick = vi.fn()
    const { getByLabelText } = render(
      <CalendarGrid days={[day]} lessons={[]} onSlotClick={onSlotClick} onLessonClick={vi.fn()} />,
    )

    const futureSlot = getByLabelText('Mon 13:00')
    expect(futureSlot.getAttribute('aria-disabled')).toBe('false')

    fireEvent.click(futureSlot)
    expect(onSlotClick).toHaveBeenCalledTimes(1)
    expect(onSlotClick).toHaveBeenCalledWith(new Date('2050-06-15T13:00:00.000Z'))
    expect(toast).not.toHaveBeenCalled()
  })
})

describe('CalendarGrid — now-line ticking', () => {
  // These tests deliberately do NOT mock officeNowAsNaiveUTC — a fixed
  // mockReturnValue can't prove a tick moves anything, since it would keep
  // returning the same instant regardless of fake-timer advancement.
  // Instead we fake the system clock and let the real implementation run;
  // advancing fake time then naturally produces new real "now" values.
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const today = new Date('2050-06-15T00:00:00.000Z')
  const otherDay = new Date('2050-06-16T00:00:00.000Z')

  it('renders the now-line only on today\'s column, at the exact fractional position', () => {
    vi.useFakeTimers()
    // 05:15:00 UTC = 07:15 Europe/Warsaw (CEST, UTC+2 in June).
    vi.setSystemTime(new Date('2050-06-15T05:15:00.000Z'))

    const { getAllByTestId, getByTestId } = render(
      <CalendarGrid days={[today, otherDay]} lessons={[]} onSlotClick={vi.fn()} onLessonClick={vi.fn()} />,
    )

    const lines = getAllByTestId('now-line')
    expect(lines).toHaveLength(1)
    expect(lines[0].style.gridColumn).toBe('2') // today is days[0] → gridColumn 2

    const marker = getByTestId('now-line-marker')
    expect(marker.style.top).toBe(`${(15 / 840) * 100}%`)
  })

  it('moves the now-line after a tick, without any prop change', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2050-06-15T05:15:00.000Z')) // 07:15 Warsaw

    const { getByTestId } = render(
      <CalendarGrid days={[today]} lessons={[]} onSlotClick={vi.fn()} onLessonClick={vi.fn()} />,
    )
    expect(getByTestId('now-line-marker').style.top).toBe(`${(15 / 840) * 100}%`)

    act(() => {
      vi.advanceTimersByTime(NOW_LINE_TICK_MS)
    })

    // A minute later: 07:16 Warsaw.
    expect(getByTestId('now-line-marker').style.top).toBe(`${(16 / 840) * 100}%`)
  })

  it('dims a slot live after a tick crosses its start time, without navigating', () => {
    vi.useFakeTimers()
    // 05:29:30 UTC = 07:29:30 Warsaw — the 07:30 slot has not started yet.
    vi.setSystemTime(new Date('2050-06-15T05:29:30.000Z'))

    const { getByLabelText } = render(
      <CalendarGrid days={[today]} lessons={[]} onSlotClick={vi.fn()} onLessonClick={vi.fn()} />,
    )
    const slot = getByLabelText('Mon 07:30')
    expect(slot.getAttribute('aria-disabled')).toBe('false')

    act(() => {
      vi.advanceTimersByTime(NOW_LINE_TICK_MS)
    })

    // A minute later: 07:30:30 Warsaw — the 07:30 slot has now started.
    expect(slot.getAttribute('aria-disabled')).toBe('true')
  })
})
