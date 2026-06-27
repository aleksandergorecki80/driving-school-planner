import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.local',
    )
  }

  const validUrl = supabaseUrl
  const validAnonKey = supabaseAnonKey

  // Build the redirect response first so setAll can attach Set-Cookie headers
  // to the same response object — unlike a Server Action where redirect() throws
  // before async cookie-clearing callbacks complete.
  const response = NextResponse.redirect(new URL('/login', request.url), { status: 302 })

  const supabase = createServerClient(validUrl, validAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  await supabase.auth.signOut({ scope: 'local' })

  return response
}
