// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import CalendarGrid from './CalendarGrid'

const NOW = new Date('2050-06-15T12:00:00.000Z')
const day = new Date('2050-06-15T00:00:00.000Z')

describe('CalendarGrid — past slot click-guard', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('does not call onSlotClick for a slot whose time has already passed today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const onSlotClick = vi.fn()
    const { getByLabelText } = render(
      <CalendarGrid days={[day]} lessons={[]} onSlotClick={onSlotClick} onLessonClick={vi.fn()} />,
    )

    const pastSlot = getByLabelText('Mon 07:00')
    expect(pastSlot.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(pastSlot)
    expect(onSlotClick).not.toHaveBeenCalled()
  })

  it('calls onSlotClick for a slot later today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const onSlotClick = vi.fn()
    const { getByLabelText } = render(
      <CalendarGrid days={[day]} lessons={[]} onSlotClick={onSlotClick} onLessonClick={vi.fn()} />,
    )

    const futureSlot = getByLabelText('Mon 13:00')
    expect(futureSlot.getAttribute('aria-disabled')).toBe('false')

    fireEvent.click(futureSlot)
    expect(onSlotClick).toHaveBeenCalledTimes(1)
    expect(onSlotClick).toHaveBeenCalledWith(new Date('2050-06-15T13:00:00.000Z'))
  })
})
