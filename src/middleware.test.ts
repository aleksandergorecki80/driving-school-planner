import { describe, it } from 'vitest'

// These tests require F-02 middleware to be implemented.
// When F-02 ships: remove .todo(), add webServer to vitest.config.ts,
// and set BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'.

describe('Risk #6 — Unauthenticated office route access (middleware)', () => {
  it.todo(
    'unauthenticated GET /office → 302 redirect with Location: /login?next=/office',
  )
  // When enabled, assertion shape:
  //   const res = await fetch(`${BASE_URL}/office`, { redirect: 'manual' })
  //   expect(res.status).toBe(302)
  //   expect(res.headers.get('location')).toMatch(/\/login\?next=%2Foffice/)

  it.todo(
    'unauthenticated GET /office/lessons → 302 redirect with Location: /login?next=/office/lessons',
  )

  it.todo(
    'unauthenticated GET /office/calendar → 302 redirect with Location: /login?next=/office/calendar',
  )

  it.todo('authenticated GET /office → 200 (session cookie present)')
  // When enabled: send a valid Supabase Auth session cookie and assert 200.
})
