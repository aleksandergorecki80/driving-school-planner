import { vi, describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
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

const { sendLessonLinkMock } = vi.hoisted(() => ({ sendLessonLinkMock: vi.fn() }))

vi.mock('@/lib/email/sendLessonLink', () => ({
  sendLessonLink: sendLessonLinkMock,
}))

import { createLesson, cancelLesson, respondToLesson, regenerateLessonToken } from './lessons'
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
// Per-suite cleanup: instructor and student seeded in beforeAll
const suiteCleanup: { table: string; id: string }[] = []
// Per-test cleanup: lesson IDs collected during each test, cleared in afterEach
let lessonIds: string[] = []

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

  // Seed an instructor and student for the tests. Email is set so the email side effect
  // (Phase 5) defaults to succeeding for tests unrelated to email behavior — see the
  // `sendLessonLinkMock` default in the top-level `beforeEach` below.
  const instructor = await seedInstructor(svc, {
    name: `test-instr-lessons-${Date.now()}`,
    email: `test-instr-lessons-${Date.now()}@example.com`,
  })
  const student = await seedStudent(svc, { name: `test-student-lessons-${Date.now()}` })
  instructorId = instructor.id
  studentId = student.id
  suiteCleanup.push(
    { table: 'instructors', id: instructorId },
    { table: 'students', id: studentId },
  )
})

beforeEach(() => {
  sendLessonLinkMock.mockReset()
  sendLessonLinkMock.mockResolvedValue({})
})

afterEach(async () => {
  // Delete all lesson rows created by this test, then reset for the next test
  await cleanupRows(svc, lessonIds.map((id) => ({ table: 'lessons', id })))
  lessonIds = []
})

afterAll(async () => {
  await cleanupRows(svc, suiteCleanup)
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

    lessonIds.push(data.id)
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

    const { data: row } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', instructorId)
      .eq('scheduled_at', BASE_TIME)
      .single()
    if (row) lessonIds.push(row.id)

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
    if (row) lessonIds.push(row.id)

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
    if (row) lessonIds.push(row.id)

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
    if (row2) lessonIds.push(row2.id)
  })
})

describe('createLesson — email side effect', () => {
  const instructorCleanup: { table: string; id: string }[] = []

  afterAll(async () => {
    // Instructors must be cleaned up after the outer per-test afterEach has already
    // deleted any lesson rows referencing them (FK constraint).
    await cleanupRows(svc, instructorCleanup)
  })

  test('sends the lesson link email when the instructor has an email on file', async () => {
    const scheduledAt = '2099-08-01T10:00:00.000Z'
    const result = await createLesson({ instructorId, studentId, category: 'B', scheduledAt })
    expect(result).toEqual({})

    const { data: row } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', instructorId)
      .eq('scheduled_at', scheduledAt)
      .single()
    if (row) lessonIds.push(row.id)

    expect(sendLessonLinkMock).toHaveBeenCalledTimes(1)
    const [to, lessonLinkUrl] = sendLessonLinkMock.mock.calls[0]
    expect(to).toMatch(/@example\.com$/)
    expect(lessonLinkUrl).toMatch(/\/lesson\/[0-9a-f-]{36}$/)
  })

  test('succeeds with a warning (not an error) when the instructor has no email', async () => {
    const emaillessInstructor = await seedInstructor(svc, {
      name: `test-instr-no-email-${Date.now()}`,
    })
    const scheduledAt = '2099-08-02T10:00:00.000Z'

    const result = await createLesson({
      instructorId: emaillessInstructor.id,
      studentId,
      category: 'B',
      scheduledAt,
    })
    expect(result).toEqual({ warning: 'Instructor has no email on file — link was not sent' })
    expect(sendLessonLinkMock).not.toHaveBeenCalled()

    const { data: row } = await svc
      .from('lessons')
      .select('id, status')
      .eq('instructor_id', emaillessInstructor.id)
      .eq('scheduled_at', scheduledAt)
      .single()
    expect(row?.status).toBe('pending')
    if (row) lessonIds.push(row.id)
    instructorCleanup.push({ table: 'instructors', id: emaillessInstructor.id })
  })

  test('succeeds with a warning (not an error) when the email send fails', async () => {
    sendLessonLinkMock.mockResolvedValueOnce({ error: 'Resend is down' })
    const scheduledAt = '2099-08-03T10:00:00.000Z'

    const result = await createLesson({ instructorId, studentId, category: 'B', scheduledAt })
    expect(result).toEqual({ warning: 'Resend is down' })

    const { data: row } = await svc
      .from('lessons')
      .select('id, status')
      .eq('instructor_id', instructorId)
      .eq('scheduled_at', scheduledAt)
      .single()
    expect(row?.status).toBe('pending')
    if (row) lessonIds.push(row.id)
  })
})

describe('createLesson — category-coherence', () => {
  let categoryInstructorId: string
  let categoryStudentId: string
  const fixtureCleanup: { table: string; id: string }[] = []

  beforeAll(async () => {
    const instructor = await seedInstructor(svc, {
      name: `test-instr-cat-${Date.now()}`,
      categories: ['C'],
      email: `test-instr-cat-${Date.now()}@example.com`,
    })
    const student = await seedStudent(svc, { name: `test-student-cat-${Date.now()}` })
    categoryInstructorId = instructor.id
    categoryStudentId = student.id
    // dependents (lessons) cleaned per-test by file-level afterEach; parents go last so
    // they are still present while lessons exist
    fixtureCleanup.push(
      { table: 'instructors', id: categoryInstructorId },
      { table: 'students', id: categoryStudentId },
    )
  })

  afterAll(async () => {
    // Sweep any lesson rows that a failing RED-state test may have created without pushing
    // to lessonIds (the assertion fires before the push, so the row leaks).
    await svc.from('lessons').delete().eq('instructor_id', categoryInstructorId)
    await cleanupRows(svc, fixtureCleanup)
  })

  test('returns { error } when category is not in instructor.categories', async () => {
    const scheduledAt = '2099-03-10T10:00:00.000Z'
    const result = await createLesson({
      instructorId: categoryInstructorId,
      studentId: categoryStudentId,
      category: 'B', // instructor only holds 'C'
      scheduledAt,
    })

    expect(result.error).toBe('Instructor does not hold this category')

    // Oracle: no row must have been inserted
    const { data } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', categoryInstructorId)
      .eq('scheduled_at', scheduledAt)
    expect(data).toHaveLength(0)
  })

  test('succeeds when category is in instructor.categories', async () => {
    const scheduledAt = '2099-03-10T11:00:00.000Z'
    const result = await createLesson({
      instructorId: categoryInstructorId,
      studentId: categoryStudentId,
      category: 'C',
      scheduledAt,
    })

    expect(result).toEqual({})

    const { data, error } = await svc
      .from('lessons')
      .select('id, category, status')
      .eq('instructor_id', categoryInstructorId)
      .eq('scheduled_at', scheduledAt)
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    if (!data) return
    expect(data.category).toBe('C')
    expect(data.status).toBe('pending')
    lessonIds.push(data.id)
  })
})

describe('createLesson — student double-booking', () => {
  let instructorAId: string
  let instructorBId: string
  let sharedStudentId: string
  const fixtureCleanup: { table: string; id: string }[] = []

  beforeAll(async () => {
    const instructorA = await seedInstructor(svc, {
      name: `test-instr-dbA-${Date.now()}`,
      categories: ['B'],
      email: `test-instr-dbA-${Date.now()}@example.com`,
    })
    const instructorB = await seedInstructor(svc, {
      name: `test-instr-dbB-${Date.now()}`,
      categories: ['B'],
      email: `test-instr-dbB-${Date.now()}@example.com`,
    })
    const student = await seedStudent(svc, { name: `test-student-db-${Date.now()}` })
    instructorAId = instructorA.id
    instructorBId = instructorB.id
    sharedStudentId = student.id
    fixtureCleanup.push(
      { table: 'instructors', id: instructorAId },
      { table: 'instructors', id: instructorBId },
      { table: 'students', id: sharedStudentId },
    )
  })

  afterAll(async () => {
    // Sweep any lesson rows a failing RED-state test may have created without pushing to
    // lessonIds (the assertion fires before the push, so the row leaks).
    await svc.from('lessons').delete().eq('student_id', sharedStudentId)
    await cleanupRows(svc, fixtureCleanup)
  })

  test('returns { error } when the student already has an overlapping lesson with a different instructor', async () => {
    const scheduledAt = '2099-04-10T10:00:00.000Z'
    const first = await createLesson({
      instructorId: instructorAId,
      studentId: sharedStudentId,
      category: 'B',
      scheduledAt,
    })
    expect(first).toEqual({})
    const { data: row } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', instructorAId)
      .eq('scheduled_at', scheduledAt)
      .single()
    if (row) lessonIds.push(row.id)

    const second = await createLesson({
      instructorId: instructorBId,
      studentId: sharedStudentId,
      category: 'B',
      scheduledAt,
    })
    expect(second.error).toBe('Student is already booked at this time')
  })

  test('returns { error } when scheduled 30 minutes apart from the existing student lesson (still within 1-hour window)', async () => {
    const firstAt = '2099-04-11T10:00:00.000Z'
    const first = await createLesson({
      instructorId: instructorAId,
      studentId: sharedStudentId,
      category: 'B',
      scheduledAt: firstAt,
    })
    expect(first).toEqual({})
    const { data: row } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', instructorAId)
      .eq('scheduled_at', firstAt)
      .single()
    if (row) lessonIds.push(row.id)

    const second = await createLesson({
      instructorId: instructorBId,
      studentId: sharedStudentId,
      category: 'B',
      scheduledAt: '2099-04-11T10:30:00.000Z',
    })
    expect(second.error).toBe('Student is already booked at this time')
  })

  test('succeeds when scheduled exactly 1 hour after the existing student lesson (boundary)', async () => {
    const firstAt = '2099-04-12T10:00:00.000Z'
    const first = await createLesson({
      instructorId: instructorAId,
      studentId: sharedStudentId,
      category: 'B',
      scheduledAt: firstAt,
    })
    expect(first).toEqual({})
    const { data: row } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', instructorAId)
      .eq('scheduled_at', firstAt)
      .single()
    if (row) lessonIds.push(row.id)

    const secondAt = '2099-04-12T11:00:00.000Z'
    const second = await createLesson({
      instructorId: instructorBId,
      studentId: sharedStudentId,
      category: 'B',
      scheduledAt: secondAt,
    })
    expect(second).toEqual({})
    const { data: row2 } = await svc
      .from('lessons')
      .select('id')
      .eq('instructor_id', instructorBId)
      .eq('scheduled_at', secondAt)
      .single()
    if (row2) lessonIds.push(row2.id)
  })
})

describe('cancelLesson', () => {
  test('sets status=cancelled and nulls the token on the target row', async () => {
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
      .select('id, token')
      .single()

    if (lesson.error) throw new Error(`seed lesson failed: ${lesson.error.message}`)
    if (!lesson.data) throw new Error('seed lesson returned no data')
    expect(lesson.data.token).not.toBeNull()

    const lessonId = lesson.data.id
    lessonIds.push(lessonId)

    const result = await cancelLesson(lessonId)
    expect(result).toEqual({})

    // Verify the status changed and the token was invalidated
    const { data: updated, error } = await svc
      .from('lessons')
      .select('status, token')
      .eq('id', lessonId)
      .single()

    expect(error).toBeNull()
    expect(updated).not.toBeNull()
    if (!updated) return
    expect(updated.status).toBe('cancelled')
    expect(updated.token).toBeNull()
  })
})

describe('respondToLesson', () => {
  const respondCleanup: { table: string; id: string }[] = []

  afterAll(async () => {
    await cleanupRows(svc, respondCleanup)
  })

  async function seedPendingLesson(scheduledAt: string) {
    const { data, error } = await svc
      .from('lessons')
      .insert({
        instructor_id: instructorId,
        student_id: studentId,
        category: 'B',
        scheduled_at: scheduledAt,
        status: 'pending',
      })
      .select('id, token')
      .single()
    if (error) throw new Error(`seed lesson failed: ${error.message}`)
    if (!data) throw new Error('seed lesson returned no data')
    respondCleanup.push({ table: 'lessons', id: data.id })
    return data as { id: string; token: string }
  }

  test('confirms a pending lesson via its token and nulls the token', async () => {
    const lesson = await seedPendingLesson('2099-06-01T10:00:00.000Z')

    const result = await respondToLesson(lesson.token, 'confirmed')
    expect(result).toEqual({})

    const { data } = await svc
      .from('lessons')
      .select('status, token')
      .eq('id', lesson.id)
      .single()
    expect(data?.status).toBe('confirmed')
    expect(data?.token).toBeNull()
  })

  test('rejects a pending lesson, with and without a reason', async () => {
    const withReason = await seedPendingLesson('2099-06-02T10:00:00.000Z')
    const withoutReason = await seedPendingLesson('2099-06-02T11:00:00.000Z')

    const resultA = await respondToLesson(withReason.token, 'rejected', 'Instructor unavailable')
    expect(resultA).toEqual({})
    const { data: rowA } = await svc
      .from('lessons')
      .select('status, rejection_reason')
      .eq('id', withReason.id)
      .single()
    expect(rowA?.status).toBe('rejected')
    expect(rowA?.rejection_reason).toBe('Instructor unavailable')

    const resultB = await respondToLesson(withoutReason.token, 'rejected')
    expect(resultB).toEqual({})
    const { data: rowB } = await svc
      .from('lessons')
      .select('status, rejection_reason')
      .eq('id', withoutReason.id)
      .single()
    expect(rowB?.status).toBe('rejected')
    expect(rowB?.rejection_reason).toBeNull()
  })

  test('returns an error for an unknown or already-consumed token', async () => {
    const unknown = await respondToLesson('00000000-0000-0000-0000-000000000000', 'confirmed')
    expect(unknown.error).toBe('Link is no longer valid')

    const lesson = await seedPendingLesson('2099-06-03T10:00:00.000Z')
    const first = await respondToLesson(lesson.token, 'confirmed')
    expect(first).toEqual({})

    const second = await respondToLesson(lesson.token, 'confirmed')
    expect(second.error).toBe('Link is no longer valid')
  })
})

describe('regenerateLessonToken', () => {
  const regenCleanup: { table: string; id: string }[] = []

  afterAll(async () => {
    await cleanupRows(svc, regenCleanup)
  })

  test('issues a new token for a pending lesson, invalidating the old one', async () => {
    const { data: lesson, error } = await svc
      .from('lessons')
      .insert({
        instructor_id: instructorId,
        student_id: studentId,
        category: 'B',
        scheduled_at: '2099-06-04T10:00:00.000Z',
        status: 'pending',
      })
      .select('id, token')
      .single()
    if (error) throw new Error(`seed lesson failed: ${error.message}`)
    if (!lesson) throw new Error('seed lesson returned no data')
    regenCleanup.push({ table: 'lessons', id: lesson.id })

    const result = await regenerateLessonToken(lesson.id)
    expect(result.error).toBeUndefined()
    expect(result.token).toBeDefined()
    expect(result.token).not.toBe(lesson.token)

    const { data: row } = await svc
      .from('lessons')
      .select('token')
      .eq('id', lesson.id)
      .single()
    expect(row?.token).toBe(result.token)
  })

  test('rejects a lesson that is not pending', async () => {
    const { data: lesson, error } = await svc
      .from('lessons')
      .insert({
        instructor_id: instructorId,
        student_id: studentId,
        category: 'B',
        scheduled_at: '2099-06-05T10:00:00.000Z',
        status: 'cancelled',
      })
      .select('id')
      .single()
    if (error) throw new Error(`seed lesson failed: ${error.message}`)
    if (!lesson) throw new Error('seed lesson returned no data')
    regenCleanup.push({ table: 'lessons', id: lesson.id })

    const result = await regenerateLessonToken(lesson.id)
    expect(result.error).toBe('Lesson not found or not pending')
  })

  test('sends a new lesson-link email with the new token', async () => {
    const { data: lesson, error } = await svc
      .from('lessons')
      .insert({
        instructor_id: instructorId,
        student_id: studentId,
        category: 'B',
        scheduled_at: '2099-06-06T10:00:00.000Z',
        status: 'pending',
      })
      .select('id')
      .single()
    if (error) throw new Error(`seed lesson failed: ${error.message}`)
    if (!lesson) throw new Error('seed lesson returned no data')
    regenCleanup.push({ table: 'lessons', id: lesson.id })

    const result = await regenerateLessonToken(lesson.id)
    expect(result.error).toBeUndefined()

    expect(sendLessonLinkMock).toHaveBeenCalledTimes(1)
    const [to, lessonLinkUrl] = sendLessonLinkMock.mock.calls[0]
    expect(to).toMatch(/@example\.com$/)
    expect(lessonLinkUrl).toContain(`/lesson/${result.token}`)
  })
})
