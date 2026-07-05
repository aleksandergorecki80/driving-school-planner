'use server'
import { createAnonClient } from '@/lib/supabase/anon'

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
