'use server'
import { createClient } from '@/lib/supabase/server'

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

  const { data: conflicts, error: checkError } = await db
    .from('lessons')
    .select('id')
    .eq('instructor_id', instructorId)
    .in('status', ['pending', 'confirmed'])
    .gt('scheduled_at', windowStart.toISOString())
    .lt('scheduled_at', slotEnd.toISOString())

  if (checkError) {
    return { error: checkError.message }
  }

  if (conflicts && conflicts.length > 0) {
    return { error: 'This slot is already booked' }
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

  const { error } = await db
    .from('lessons')
    .update({ status: 'cancelled' })
    .eq('id', lessonId)

  if (error) {
    return { error: error.message }
  }

  return {}
}
