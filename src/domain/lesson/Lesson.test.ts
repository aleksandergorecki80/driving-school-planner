import { describe, it, expect } from 'vitest'
import { Lesson, InstructorCategoryMismatchError, StudentCategoryMismatchError } from './Lesson'

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
})
