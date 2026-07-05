'use server'
import { createClient } from '@/lib/supabase/server'

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
