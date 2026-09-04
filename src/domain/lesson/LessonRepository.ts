import type { SupabaseClient } from '@supabase/supabase-js'
import {
  Lesson,
  InstructorCategoryMismatchError,
  StudentCategoryMismatchError,
  PastScheduledAtError,
} from './Lesson'

export class InstructorNotFoundError extends Error {
  constructor(readonly instructorId: string) {
    super(`Instructor ${instructorId} not found`)
  }
}

export class StudentNotFoundError extends Error {
  constructor(readonly studentId: string) {
    super(`Student ${studentId} not found`)
  }
}

export class SlotUnavailableError extends Error {
  constructor(readonly side: 'instructor' | 'student') {
    super(`Slot unavailable for ${side}`)
  }
}

interface BookLessonRow {
  ok: boolean
  error_code: string | null
  lesson_id: string | null
  token: string | null
}

export class LessonRepository {
  constructor(private db: SupabaseClient) {}

  async save(lesson: Lesson): Promise<{ id: string; token: string }> {
    const { data, error } = await this.db.rpc('book_lesson', {
      p_instructor_id: lesson.instructorId,
      p_student_id: lesson.studentId,
      p_category: lesson.category,
      p_scheduled_at: lesson.scheduledAt.toISOString(),
    })

    if (error) {
      throw error
    }

    const row = (data as BookLessonRow[] | null)?.[0]
    if (!row || !row.ok) {
      switch (row?.error_code) {
        case 'SCHEDULED_AT_IN_PAST':
          throw new PastScheduledAtError(lesson.scheduledAt)
        case 'INSTRUCTOR_NOT_FOUND':
          throw new InstructorNotFoundError(lesson.instructorId)
        case 'STUDENT_NOT_FOUND':
          throw new StudentNotFoundError(lesson.studentId)
        case 'INSTRUCTOR_CATEGORY_MISMATCH':
          throw new InstructorCategoryMismatchError(lesson.instructorId, lesson.category)
        case 'STUDENT_CATEGORY_MISMATCH':
          throw new StudentCategoryMismatchError(lesson.studentId, lesson.category)
        case 'SLOT_UNAVAILABLE_INSTRUCTOR':
          throw new SlotUnavailableError('instructor')
        case 'SLOT_UNAVAILABLE_STUDENT':
          throw new SlotUnavailableError('student')
        default:
          throw new Error(`book_lesson returned an unrecognized error_code: ${row?.error_code}`)
      }
    }

    if (!row.lesson_id || !row.token) {
      throw new Error('book_lesson reported ok=true without a lesson_id/token')
    }
    return { id: row.lesson_id, token: row.token }
  }
}
