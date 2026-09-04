'use server'
import { createClient } from '@/lib/supabase/server'
import { sendLessonLink } from '@/lib/email/sendLessonLink'
import {
  Lesson,
  InstructorCategoryMismatchError,
  StudentCategoryMismatchError,
  PastScheduledAtError,
} from '@/domain/lesson/Lesson'
import {
  LessonRepository,
  InstructorNotFoundError,
  StudentNotFoundError,
  SlotUnavailableError,
} from '@/domain/lesson/LessonRepository'

function mapDomainErrorToMessage(err: unknown): string {
  if (err instanceof InstructorNotFoundError) return 'Instructor not found'
  if (err instanceof StudentNotFoundError) return 'Student not found'
  if (err instanceof InstructorCategoryMismatchError) return 'Instructor does not hold this category'
  if (err instanceof StudentCategoryMismatchError) return 'Student is not enrolled in this category'
  if (err instanceof PastScheduledAtError) return 'Cannot schedule a lesson in the past'
  if (err instanceof SlotUnavailableError) {
    return err.side === 'instructor' ? 'This slot is already booked' : 'Student is already booked at this time'
  }
  if (err instanceof Error) return err.message
  return 'Unexpected error while creating the lesson'
}

export async function createLesson(data: {
  instructorId: string
  studentId: string
  category: string
  scheduledAt: string
  overrideEmail?: string
}): Promise<{ error?: string; warning?: string }> {
  const { instructorId, studentId, category, scheduledAt, overrideEmail } = data

  const slotStart = new Date(scheduledAt)
  if (isNaN(slotStart.getTime())) {
    return { error: 'Invalid scheduledAt timestamp' }
  }

  const db = await createClient()

  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Verify instructor and student exist, and fetch what Lesson.propose() needs to check
  // category coherence in-memory before any network round-trip to book_lesson.
  // When deactivated_at is added to these tables, add .is('deactivated_at', null) here.
  const { data: instructor } = await db
    .from('instructors')
    .select('id, categories, email')
    .eq('id', instructorId)
    .single()
  if (!instructor) return { error: 'Instructor not found' }

  const { data: student } = await db
    .from('students')
    .select('id, category')
    .eq('id', studentId)
    .single()
  if (!student) return { error: 'Student not found' }

  let saved: { id: string; token: string }
  try {
    const lesson = Lesson.propose({ instructor, student, category, scheduledAt: slotStart })
    saved = await new LessonRepository(db).save(lesson)
  } catch (err) {
    return { error: mapDomainErrorToMessage(err) }
  }

  const recipientEmail = overrideEmail?.trim() || instructor.email
  if (!recipientEmail) {
    return { warning: 'Instructor has no email on file — link was not sent' }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return { warning: 'NEXT_PUBLIC_APP_URL is not configured — link was not sent' }
  }

  const lessonLinkUrl = `${appUrl}/lesson/${saved.token}`
  const { error: sendError } = await sendLessonLink(recipientEmail, lessonLinkUrl)
  if (sendError) {
    return { warning: sendError }
  }

  return {}
}
