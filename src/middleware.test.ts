import { beforeAll, describe, expect, it } from 'vitest'
import { createServerClient } from '@supabase/ssr'

const OFFICE_EMAIL = process.env.OFFICE_EMAIL ?? ''
const OFFICE_PASSWORD = process.env.OFFICE_PASSWORD ?? ''
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

const missingCreds = !OFFICE_EMAIL || !OFFICE_PASSWORD

describe('Risk #6 — Unauthenticated office route access (middleware)', () => {
  let sessionCookieHeader = ''

  beforeAll(async () => {
    if (missingCreds) return

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.test',
      )
    }

    const validUrl = supabaseUrl
    const validAnonKey = supabaseAnonKey

    const cookies: Record<string, string> = {}

    const supabase = createServerClient(validUrl, validAnonKey, {
      cookies: {
        getAll() {
          return Object.entries(cookies).map(([name, value]) => ({ name, value }))
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            if (value) cookies[name] = value
            else delete cookies[name]
          })
        },
      },
    })

    const { error } = await supabase.auth.signInWithPassword({
      email: OFFICE_EMAIL,
      password: OFFICE_PASSWORD,
    })

    if (error) {
      // Don't throw — tests 1–3 are unauthenticated and must run regardless.
      // Test 4 will skip via context.skip() when sessionCookieHeader stays empty.
      console.warn(`[middleware.test] Authenticated test will be skipped: ${error.message}`)
      return
    }

    // Values from createServerClient are raw strings; URL-encode them for the
    // Cookie header so Next.js's cookie parser decodes them back to raw.
    sessionCookieHeader = Object.entries(cookies)
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join('; ')
  })

  it('unauthenticated GET /office → 302 redirect with Location: /login?next=/office', async () => {
    const res = await fetch(`${BASE_URL}/office`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(/\/login\?next=%2Foffice/)
  })

  it('unauthenticated GET /office/lessons → 302 redirect with Location: /login?next=/office/lessons', async () => {
    const res = await fetch(`${BASE_URL}/office/lessons`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(/\/login\?next=%2Foffice%2Flessons/)
  })

  it('unauthenticated GET /office/calendar → 302 redirect with Location: /login?next=/office/calendar', async () => {
    const res = await fetch(`${BASE_URL}/office/calendar`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(/\/login\?next=%2Foffice%2Fcalendar/)
  })

  it('authenticated GET /office → 200 (session cookie present)', async (context) => {
    if (missingCreds || !sessionCookieHeader) {
      context.skip()
    }
    const res = await fetch(`${BASE_URL}/office`, {
      redirect: 'manual',
      headers: { cookie: sessionCookieHeader },
    })
    expect(res.status).toBe(200)
  })
})
