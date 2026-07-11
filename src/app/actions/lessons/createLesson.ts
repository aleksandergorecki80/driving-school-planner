'use server'
import { createClient } from '@/lib/supabase/server'
import { sendLessonLink } from '@/lib/email/sendLessonLink'

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

  // Two 1-hour lessons overlap iff one starts strictly inside the other's window.
  // Window: (slotStart - 1h, slotStart + 1h) — strictly exclusive on both ends.
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000)
  const windowStart = new Date(slotStart.getTime() - 60 * 60 * 1000)

  const db = await createClient()

  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Verify instructor and student exist.
  // When deactivated_at is added to these tables, add .is('deactivated_at', null) here.
  const { data: instructor } = await db
    .from('instructors')
    .select('id, categories, email')
    .eq('id', instructorId)
    .single()
  if (!instructor) return { error: 'Instructor not found' }
  if (!instructor.categories.includes(category)) {
    return { error: 'Instructor does not hold this category' }
  }

  const { data: student } = await db
    .from('students')
    .select('id')
    .eq('id', studentId)
    .single()
  if (!student) return { error: 'Student not found' }

  const { data: conflicts, error: checkError } = await db
    .from('lessons')
    .select('id')
    .eq('instructor_id', instructorId)
    .in('status', ['pending', 'confirmed'])
    .gt('scheduled_at', windowStart.toISOString())
    .lt('scheduled_at', slotEnd.toISOString())
    .limit(1)

  if (checkError) {
    return { error: checkError.message }
  }

  if (conflicts && conflicts.length > 0) {
    return { error: 'This slot is already booked' }
  }

  const { data: studentConflicts, error: studentCheckError } = await db
    .from('lessons')
    .select('id')
    .eq('student_id', studentId)
    .in('status', ['pending', 'confirmed'])
    .gt('scheduled_at', windowStart.toISOString())
    .lt('scheduled_at', slotEnd.toISOString())
    .limit(1)

  if (studentCheckError) {
    return { error: studentCheckError.message }
  }

  if (studentConflicts && studentConflicts.length > 0) {
    return { error: 'Student is already booked at this time' }
  }

  const { data: inserted, error: insertError } = await db
    .from('lessons')
    .insert({
      instructor_id: instructorId,
      student_id: studentId,
      category,
      scheduled_at: scheduledAt,
      status: 'pending',
    })
    .select('token')
    .single()

  if (insertError) {
    return { error: insertError.message }
  }

  const recipientEmail = overrideEmail?.trim() || instructor.email
  if (!recipientEmail) {
    return { warning: 'Instructor has no email on file — link was not sent' }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return { warning: 'NEXT_PUBLIC_APP_URL is not configured — link was not sent' }
  }

  const lessonLinkUrl = `${appUrl}/lesson/${inserted?.token}`
  const { error: sendError } = await sendLessonLink(recipientEmail, lessonLinkUrl)
  if (sendError) {
    return { warning: sendError }
  }

  return {}
}
