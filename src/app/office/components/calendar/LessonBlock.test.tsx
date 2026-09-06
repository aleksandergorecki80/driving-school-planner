// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { LessonRow } from '../types'
import LessonBlock from './LessonBlock'

function makeLesson(status: LessonRow['status']): LessonRow {
  return {
    id: 'lesson-1',
    scheduled_at: '2050-06-15T13:00:00.000Z',
    status,
    category: 'B',
    rejection_reason: null,
    students: { name: 'Jane Doe' },
  }
}

describe('LessonBlock — status badge', () => {
  afterEach(() => {
    cleanup()
  })

  it.each([
    ['pending', 'Pending'],
    ['confirmed', 'Confirmed'],
    ['rejected', 'Rejected'],
  ] as const)('shows the "%s" status label and includes it in aria-label', (status, label) => {
    const { getByText, getByRole } = render(
      <LessonBlock
        lesson={makeLesson(status)}
        gridRow="2 / 4"
        gridColumn={2}
        onClick={vi.fn()}
      />,
    )

    expect(getByText(label).textContent).toBe(label)

    const tile = getByRole('button', { name: `Jane Doe – B – ${label}` })
    expect(tile).not.toBeNull()
  })
})
