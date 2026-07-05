'use server'
import { createClient } from '@/lib/supabase/server'
import { sendLessonLink } from '@/lib/email/sendLessonLink'

const appUrl = process.env.NEXT_PUBLIC_APP_URL
if (!appUrl) {
  throw new Error('Missing NEXT_PUBLIC_APP_URL — check .env.local')
}
const validAppUrl = appUrl

// lessons.instructor_id → instructors.id is many-to-one; PostgREST embeds as an object,
// not an array (the untyped Supabase client can't infer this on its own — see LessonRow).
type LessonWithInstructorEmail = { id: string; instructors: { email: string | null } | null }

export async function regenerateLessonToken(
  lessonId: string,
): Promise<{ error?: string; token?: string; warning?: string }> {
  const db = await createClient()

  const { data: { user } } = await db.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const newToken = crypto.randomUUID()

  const { data, error } = await db
    .from('lessons')
    .update({ token: newToken })
    .eq('id', lessonId)
    .eq('status', 'pending')
    .select('id, instructors(email)')
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }

  const row = data as LessonWithInstructorEmail | null
  if (!row) {
    return { error: 'Lesson not found or not pending' }
  }

  const email = row.instructors?.email
  if (!email) {
    return { token: newToken, warning: 'Instructor has no email on file — link was not sent' }
  }

  const lessonLinkUrl = `${validAppUrl}/lesson/${newToken}`
  const { error: sendError } = await sendLessonLink(email, lessonLinkUrl)
  if (sendError) {
    return { token: newToken, warning: sendError }
  }

  return { token: newToken }
}
