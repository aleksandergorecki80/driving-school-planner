'use server'
import { createClient } from '@/lib/supabase/server'

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
