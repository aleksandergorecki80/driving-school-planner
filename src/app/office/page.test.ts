import { beforeAll, afterAll, describe, expect, test } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import {
  createTestServiceRoleClient,
  seedInstructor,
  seedStudent,
  seedLesson,
  cleanupRows,
} from '@/lib/supabase/test-client'

const OFFICE_EMAIL = process.env.OFFICE_EMAIL ?? ''
const OFFICE_PASSWORD = process.env.OFFICE_PASSWORD ?? ''
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

const missingCreds = !OFFICE_EMAIL || !OFFICE_PASSWORD

// A Monday far in the future, so this test's week never collides with real data.
const WEEK_START = '2099-06-01'
const SCHEDULED_AT = '2099-06-01T10:00:00.000Z'

describe('Risk #4 — office view reflects live DB state, not a cached snapshot', () => {
  let sessionCookieHeader = ''

  beforeAll(async () => {
    if (missingCreds) return

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.test')
    }

    const cookies: Record<string, string> = {}
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
      console.warn(`[office/page.test] Authenticated test will be skipped: ${error.message}`)
      return
    }

    sessionCookieHeader = Object.entries(cookies)
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join('; ')
  })

  const svc = createTestServiceRoleClient()
  const lessonCleanup: { table: string; id: string }[] = []
  const suiteCleanup: { table: string; id: string }[] = []

  afterAll(async () => {
    // Lesson rows must be deleted before their instructor/student parents (FK constraint).
    await cleanupRows(svc, lessonCleanup)
    await cleanupRows(svc, suiteCleanup)
  })

  test('a status change written directly to the DB is reflected on the very next request', async (context) => {
    if (missingCreds || !sessionCookieHeader) {
      context.skip()
    }

    const instructor = await seedInstructor(svc, { name: `test-office-poll-${Date.now()}` })
    const student = await seedStudent(svc, { name: `test-office-poll-student-${Date.now()}` })
    suiteCleanup.push({ table: 'instructors', id: instructor.id }, { table: 'students', id: student.id })

    const lesson = await seedLesson(svc, instructor.id, student.id, {
      scheduled_at: SCHEDULED_AT,
      status: 'pending',
    })
    lessonCleanup.push({ table: 'lessons', id: lesson.id })

    const url = `${BASE_URL}/office?instructor=${instructor.id}&week=${WEEK_START}`
    const headers = { cookie: sessionCookieHeader }

    const firstResponse = await fetch(url, { headers })
    const firstHtml = await firstResponse.text()
    expect(firstHtml).toContain('bg-yellow-200') // pending color

    const { error: updateError } = await svc
      .from('lessons')
      .update({ status: 'confirmed' })
      .eq('id', lesson.id)
    if (updateError) throw new Error(`status update failed: ${updateError.message}`)

    const secondResponse = await fetch(url, { headers })
    const secondHtml = await secondResponse.text()
    expect(secondHtml).toContain('bg-green-200') // confirmed color
    expect(secondHtml).not.toContain('bg-yellow-200') // stale pending color must be gone
  })
})
