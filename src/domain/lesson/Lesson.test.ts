import { describe, it, expect, afterEach, vi } from 'vitest'
import * as officeTime from '@/lib/office-time'
import {
  Lesson,
  InstructorCategoryMismatchError,
  StudentCategoryMismatchError,
  PastScheduledAtError,
} from './Lesson'

const instructor = { id: 'instructor-1', categories: ['C'] }
const student = { id: 'student-1', category: 'C' }
const scheduledAt = new Date('2099-01-01T10:00:00.000Z')

describe('Lesson.propose', () => {
  it('constructs a Lesson when the category matches both the instructor and the student', () => {
    const lesson = Lesson.propose({ instructor, student, category: 'C', scheduledAt })

    expect(lesson.instructorId).toBe('instructor-1')
    expect(lesson.studentId).toBe('student-1')
    expect(lesson.category).toBe('C')
    expect(lesson.scheduledAt).toBe(scheduledAt)
  })

  it('throws InstructorCategoryMismatchError when the instructor does not hold the category', () => {
    expect(() =>
      Lesson.propose({ instructor, student, category: 'B', scheduledAt }),
    ).toThrow(InstructorCategoryMismatchError)
  })

  it('throws StudentCategoryMismatchError when only the student does not hold the category', () => {
    const mismatchedStudent = { id: 'student-2', category: 'B' }

    expect(() =>
      Lesson.propose({ instructor, student: mismatchedStudent, category: 'C', scheduledAt }),
    ).toThrow(StudentCategoryMismatchError)
  })

  it('throws InstructorCategoryMismatchError (not student) when both mismatch', () => {
    const mismatchedStudent = { id: 'student-2', category: 'B' }

    expect(() =>
      Lesson.propose({ instructor, student: mismatchedStudent, category: 'D', scheduledAt }),
    ).toThrow(InstructorCategoryMismatchError)
  })

  describe('past scheduledAt', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('throws PastScheduledAtError when scheduledAt is before now', () => {
      vi.spyOn(officeTime, 'officeNowAsNaiveUTC').mockReturnValue(new Date('2050-06-15T12:00:00.000Z'))

      const pastScheduledAt = new Date('2050-06-15T11:59:59.999Z')

      expect(() =>
        Lesson.propose({ instructor, student, category: 'C', scheduledAt: pastScheduledAt }),
      ).toThrow(PastScheduledAtError)
    })

    it('succeeds when scheduledAt is exactly now', () => {
      const now = new Date('2050-06-15T12:00:00.000Z')
      vi.spyOn(officeTime, 'officeNowAsNaiveUTC').mockReturnValue(now)

      const lesson = Lesson.propose({ instructor, student, category: 'C', scheduledAt: now })

      expect(lesson.scheduledAt).toBe(now)
    })

    it('succeeds when scheduledAt is after now', () => {
      vi.spyOn(officeTime, 'officeNowAsNaiveUTC').mockReturnValue(new Date('2050-06-15T12:00:00.000Z'))

      const futureScheduledAt = new Date('2050-06-15T12:00:00.001Z')

      const lesson = Lesson.propose({ instructor, student, category: 'C', scheduledAt: futureScheduledAt })

      expect(lesson.scheduledAt).toBe(futureScheduledAt)
    })

    it('throws PastScheduledAtError for a scheduledAt that is UTC-future but Warsaw-wall-clock-past — the exact production bug (2026-09-05)', () => {
      // True system clock: 15:03 UTC. Under the old (buggy) Date.now()
      // comparison, a 15:30 scheduledAt would look like it's still ~27
      // minutes in the future and would NOT throw — exactly what let a past
      // lesson slip through in production.
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-05T15:03:00.000Z'))

      // But Warsaw is UTC+2 (CEST) in September, so the office's real wall
      // clock reads 17:03 at that same instant — well past the 15:30 slot.
      vi.spyOn(officeTime, 'officeNowAsNaiveUTC').mockReturnValue(new Date('2026-09-05T17:03:00.000Z'))

      const scheduledAt = new Date('2026-09-05T15:30:00.000Z')

      expect(() =>
        Lesson.propose({ instructor, student, category: 'C', scheduledAt }),
      ).toThrow(PastScheduledAtError)

      vi.useRealTimers()
    })
  })
})
