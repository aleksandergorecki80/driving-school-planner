'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function loginAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const email = formData.get('email')
  const password = formData.get('password')
  const next = formData.get('next')

  if (typeof email !== 'string' || typeof password !== 'string') {
    return 'Invalid form submission'
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return error.message
  }

  const safeNext =
    typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
      ? next
      : '/office'

  redirect(safeNext)
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}
