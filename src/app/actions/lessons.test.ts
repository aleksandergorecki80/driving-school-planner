import { vi, describe, test, expect, beforeAll, afterEach } from 'vitest'
import { createServerClient } from '@supabase/ssr'

// Mutable cookie store — populated in beforeAll by signing in as the office user,
// then read by the next/headers mock so createClient() inside the actions gets a real session.
let sessionCookies: Array<{ name: string; value: string }> = []

vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: () => sessionCookies,
      setAll: (cs: Array<{ name: string; value: string }>) => {
        sessionCookies = cs.filter((c) => Boolean(c.value))
      },
    }),
  ),
}))

import { createLesson, cancelLesson } from './lessons'
import {
  createTestServiceRoleClient,
  seedInstructor,
  seedStudent,
  cleanupRows,
} from '@/lib/supabase/test-client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const officeEmail = process.env.OFFICE_EMAIL
const officePassword = process.env.OFFICE_PASSWORD

if (!supabaseUrl || !supabaseAnonKey || !officeEmail || !officePassword) {
  throw new Error(
    'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ' +
      'OFFICE_EMAIL, OFFICE_PASSWORD — copy from .env.test',
  )
}

const validUrl = supabaseUrl
const validAnonKey = supabaseAnonKey
const validEmail = officeEmail
const validPassword = officePassword

const svc = createTestServiceRoleClient()

// ISO timestamp well in the future so overlap checks don't collide with real seed data
const BASE_TIME = '2099-01-15T10:00:00.000Z'

let instructorId: string
let studentId: string
const cleanup: { table: string; id: string }[] = []

beforeAll(async () => {
  // Sign in as the office user so the next/headers mock carries a valid session
  const authClient = createServerClient(validUrl, validAnonKey, {
    cookies: {
      getAll: () => sessionCookies,
      setAll: (cs) => {
        sessionCookies = cs.filter((c) => Boolean(c.value))
      },
    },
  })
  const { error: signInError } = await authClient.auth.signInWithPassword({
    email: validEmail,
    password: validPassword,
  })
  if (signInError) {
    throw new Error(`Office sign-in failed: ${signInError.message}`)
  }

  // Seed an instructor and student for the tests
  const instructor = await seedInstructor(svc, { name: `test-instr-lessons-${Date.now()}` })
  const student = await seedStudent(svc, { name: `test-student-lessons-${Date.now()}` })
  instructorId = instructor.id
  studentId = student.id
  cleanup.push(
    { table: 'instructors', id: instructorId },
    { table: 'students', id: studentId },
  )
})

afterEach(async () => {
  // Remove any lessons created during tests (but keep instructor/student for later tests)
  const lessonRows = cleanup.filter((r) => r.table === 'lessons')
  await cleanupRows(svc, lessonRows)
  // Remove from the in-memory list so we don't double-delete
  lessonRows.forEach((row) => {
    const idx = cleanup.indexOf(row)
    if (idx !== -1) cleanup.splice(idx, 1)
  })
})

// afterAll cleans up the seeded instructor and student
import { afterAll } from 'vitest'
afterAll(async () => {
  await cleanupRows(svc, cleanup)
})

describe('createLesson', () => {
  test('inserts a lesson with status=pending and returns {}', async () => {
    const result = await createLesson({
      instructorId,
      studentId,
      category: 'B',
      scheduledAt: BASE_TIME,
    })

    expect(result).toEqual({})

    // Verify the row actually landed in the DB
    const { data, error } = await svc
      .from('lessons')
      .select('id, status, instructor_id, student_id, category')
      .eq('instructor_id', instructorId)
      .eq('scheduled_at', BASE_TIME)
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    if (!data) return
    expect(data.status).toBe('pending')
    expect(data.instructor_id).toBe(instructorId)
    expect(data.student_id).toBe(studentId)
    expect(data.category).toBe('B')

    cleanup.push({ table: 'lessons', id: data.id })
  })

  test('returns { error } when scheduledAt is not a valid ISO timestamp', async () => {
    const result = await createLesson({
      instructorId,
      studentId,
      category: 'B',
      scheduledAt: 'not-a-date',
    })

    expect(result.error).toBe('Invalid scheduledAt timestamp')
  })

  test('returns { error: "This slot is already booked" } for an exact duplicate slot', async () => {
    // First booking succeeds
    const first = await createLesson({
      instructorId,
      studentId,
      category: 'B',
      scheduledAt: BASE_TIME,
    })
    expect(first).toEqual({})

    // Track so afterEach can clean up
    const { data: row } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', instructorId)
      .eq('scheduled_at', BASE_TIME)
      .single()
    if (row) cleanup.push({ table: 'lessons', id: row.id })

    // Second booking at the same slot should be rejected
    const second = await createLesson({
      instructorId,
      studentId,
      category: 'B',
      scheduledAt: BASE_TIME,
    })
    expect(second.error).toBe('This slot is already booked')
  })

  test('returns { error } when scheduled 30 minutes apart (still within 1-hour window)', async () => {
    // Book at BASE_TIME
    const first = await createLesson({
      instructorId,
      studentId,
      category: 'B',
      scheduledAt: BASE_TIME,
    })
    expect(first).toEqual({})
    const { data: row } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', instructorId)
      .eq('scheduled_at', BASE_TIME)
      .single()
    if (row) cleanup.push({ table: 'lessons', id: row.id })

    // 30 minutes later — still overlaps a 1-hour lesson
    const thirtyMinLater = '2099-01-15T10:30:00.000Z'
    const second = await createLesson({
      instructorId,
      studentId,
      category: 'B',
      scheduledAt: thirtyMinLater,
    })
    expect(second.error).toBe('This slot is already booked')
  })

  test('succeeds when scheduled exactly 1 hour after an existing lesson (no overlap)', async () => {
    // Book at BASE_TIME
    const first = await createLesson({
      instructorId,
      studentId,
      category: 'B',
      scheduledAt: BASE_TIME,
    })
    expect(first).toEqual({})
    const { data: row } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', instructorId)
      .eq('scheduled_at', BASE_TIME)
      .single()
    if (row) cleanup.push({ table: 'lessons', id: row.id })

    // Exactly 1 hour later — boundary is exclusive, so this should succeed
    const oneHourLater = '2099-01-15T11:00:00.000Z'
    const second = await createLesson({
      instructorId,
      studentId,
      category: 'B',
      scheduledAt: oneHourLater,
    })
    expect(second).toEqual({})
    const { data: row2 } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', instructorId)
      .eq('scheduled_at', oneHourLater)
      .single()
    if (row2) cleanup.push({ table: 'lessons', id: row2.id })
  })
})

describe('cancelLesson', () => {
  test('sets status=cancelled on the target row and returns {}', async () => {
    // Seed a lesson directly so we control its id
    const lesson = await svc
      .from('lessons')
      .insert({
        instructor_id: instructorId,
        student_id: studentId,
        category: 'B',
        scheduled_at: '2099-02-01T09:00:00.000Z',
        status: 'pending',
      })
      .select('id')
      .single()

    if (lesson.error) throw new Error(`seed lesson failed: ${lesson.error.message}`)
    if (!lesson.data) throw new Error('seed lesson returned no data')

    const lessonId = lesson.data.id
    cleanup.push({ table: 'lessons', id: lessonId })

    const result = await cancelLesson(lessonId)
    expect(result).toEqual({})

    // Verify the status changed
    const { data: updated, error } = await svc
      .from('lessons')
      .select('status')
      .eq('id', lessonId)
      .single()

    expect(error).toBeNull()
    expect(updated).not.toBeNull()
    if (!updated) return
    expect(updated.status).toBe('cancelled')
  })
})
