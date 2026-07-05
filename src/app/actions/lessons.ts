'use server'
import { createClient } from '@/lib/supabase/server'
import { createAnonClient } from '@/lib/supabase/anon'

export async function createLesson(data: {
  instructorId: string
  studentId: string
  category: string
  scheduledAt: string
}): Promise<{ error?: string }> {
  const { instructorId, studentId, category, scheduledAt } = data

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
    .select('id, categories')
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

  const { error: insertError } = await db.from('lessons').insert({
    instructor_id: instructorId,
    student_id: studentId,
    category,
    scheduled_at: scheduledAt,
    status: 'pending',
  })

  if (insertError) {
    return { error: insertError.message }
  }

  return {}
}

export async function cancelLesson(lessonId: string): Promise<{ error?: string }> {
  const db = await createClient()

  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data, error } = await db
    .from('lessons')
    .update({ status: 'cancelled', token: null })
    .eq('id', lessonId)
    .in('status', ['pending', 'confirmed'])
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  if (!data) {
    return { error: 'Lesson not found or already cancelled' }
  }

  return {}
}

export async function respondToLesson(
  token: string,
  decision: 'confirmed' | 'rejected',
  reason?: string,
): Promise<{ error?: string }> {
  const anon = createAnonClient()

  const { data, error } = await anon.rpc('respond_to_lesson', {
    p_token: token,
    p_decision: decision,
    p_reason: reason ?? null,
  })

  if (error) {
    return { error: error.message }
  }

  const result = data?.[0]
  if (!result || !result.ok) {
    return { error: result?.error_message ?? 'Link is no longer valid' }
  }

  return {}
}

export async function regenerateLessonToken(
  lessonId: string,
): Promise<{ error?: string; token?: string }> {
  const db = await createClient()

  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const newToken = crypto.randomUUID()

  const { data, error } = await db
    .from('lessons')
    .update({ token: newToken })
    .eq('id', lessonId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }

  if (!data) {
    return { error: 'Lesson not found or not pending' }
  }

  return { token: newToken }
}
