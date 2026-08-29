import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import {
  createTestServiceRoleClient,
  createTestAuthenticatedClient,
  seedInstructor,
  seedStudent,
  cleanupRows,
} from './test-client'

describe('book_lesson RPC', () => {
  const svc = createTestServiceRoleClient()

  let office: Awaited<ReturnType<typeof createTestAuthenticatedClient>>
  let instructorId: string
  let studentId: string
  const suiteCleanup: { table: string; id: string }[] = []
  let lessonIds: string[] = []

  beforeAll(async () => {
    office = await createTestAuthenticatedClient()
    const instructor = await seedInstructor(svc, {
      name: `test-instr-book-${Date.now()}`,
      categories: ['C'],
    })
    const student = await seedStudent(svc, {
      name: `test-student-book-${Date.now()}`,
      category: 'C',
    })
    instructorId = instructor.id
    studentId = student.id
    suiteCleanup.push(
      { table: 'instructors', id: instructorId },
      { table: 'students', id: studentId },
    )
  })

  afterEach(async () => {
    await cleanupRows(svc, lessonIds.map((id) => ({ table: 'lessons', id })))
    lessonIds = []
  })

  afterAll(async () => {
    await cleanupRows(svc, suiteCleanup)
  })

  it('succeeds for a coherent booking and returns a lesson_id + token', async () => {
    const { data, error } = await office.rpc('book_lesson', {
      p_instructor_id: instructorId,
      p_student_id: studentId,
      p_category: 'C',
      p_scheduled_at: '2099-07-01T10:00:00.000Z',
    })

    expect(error).toBeNull()
    const row = data?.[0]
    expect(row?.ok).toBe(true)
    expect(row?.lesson_id).toBeTruthy()
    expect(row?.token).toBeTruthy()
    if (row?.lesson_id) lessonIds.push(row.lesson_id)
  })

  it('returns INSTRUCTOR_CATEGORY_MISMATCH when the instructor does not hold the category', async () => {
    const { data, error } = await office.rpc('book_lesson', {
      p_instructor_id: instructorId,
      p_student_id: studentId,
      p_category: 'B', // instructor only holds 'C'
      p_scheduled_at: '2099-07-02T10:00:00.000Z',
    })

    expect(error).toBeNull()
    const row = data?.[0]
    expect(row?.ok).toBe(false)
    expect(row?.error_code).toBe('INSTRUCTOR_CATEGORY_MISMATCH')
    expect(row?.lesson_id).toBeNull()
  })

  it('returns STUDENT_CATEGORY_MISMATCH when only the student does not hold the category', async () => {
    const mismatchedStudent = await seedStudent(svc, {
      name: `test-student-mismatch-${Date.now()}`,
      category: 'B',
    })
    suiteCleanup.push({ table: 'students', id: mismatchedStudent.id })

    const { data, error } = await office.rpc('book_lesson', {
      p_instructor_id: instructorId,
      p_student_id: mismatchedStudent.id,
      p_category: 'C', // matches instructor, not this student
      p_scheduled_at: '2099-07-03T10:00:00.000Z',
    })

    expect(error).toBeNull()
    const row = data?.[0]
    expect(row?.ok).toBe(false)
    expect(row?.error_code).toBe('STUDENT_CATEGORY_MISMATCH')
    expect(row?.lesson_id).toBeNull()
  })

  it('returns INSTRUCTOR_CATEGORY_MISMATCH (not student) when both mismatch', async () => {
    const mismatchedStudent = await seedStudent(svc, {
      name: `test-student-both-mismatch-${Date.now()}`,
      category: 'B',
    })
    suiteCleanup.push({ table: 'students', id: mismatchedStudent.id })

    const { data, error } = await office.rpc('book_lesson', {
      p_instructor_id: instructorId,
      p_student_id: mismatchedStudent.id,
      p_category: 'D', // matches neither instructor ('C') nor student ('B')
      p_scheduled_at: '2099-07-04T10:00:00.000Z',
    })

    expect(error).toBeNull()
    const row = data?.[0]
    expect(row?.ok).toBe(false)
    expect(row?.error_code).toBe('INSTRUCTOR_CATEGORY_MISMATCH')
  })

  describe('instructor slot overlap', () => {
    it('rejects an exact-duplicate slot with SLOT_UNAVAILABLE_INSTRUCTOR', async () => {
      const scheduledAt = '2099-07-05T10:00:00.000Z'
      const first = await office.rpc('book_lesson', {
        p_instructor_id: instructorId,
        p_student_id: studentId,
        p_category: 'C',
        p_scheduled_at: scheduledAt,
      })
      expect(first.data?.[0].ok).toBe(true)
      if (first.data?.[0].lesson_id) lessonIds.push(first.data[0].lesson_id)

      const second = await office.rpc('book_lesson', {
        p_instructor_id: instructorId,
        p_student_id: studentId,
        p_category: 'C',
        p_scheduled_at: scheduledAt,
      })
      expect(second.data?.[0].ok).toBe(false)
      expect(second.data?.[0].error_code).toBe('SLOT_UNAVAILABLE_INSTRUCTOR')
    })

    it('rejects a slot 30 minutes apart (still within the 1-hour window)', async () => {
      const first = await office.rpc('book_lesson', {
        p_instructor_id: instructorId,
        p_student_id: studentId,
        p_category: 'C',
        p_scheduled_at: '2099-07-06T10:00:00.000Z',
      })
      expect(first.data?.[0].ok).toBe(true)
      if (first.data?.[0].lesson_id) lessonIds.push(first.data[0].lesson_id)

      const second = await office.rpc('book_lesson', {
        p_instructor_id: instructorId,
        p_student_id: studentId,
        p_category: 'C',
        p_scheduled_at: '2099-07-06T10:30:00.000Z',
      })
      expect(second.data?.[0].ok).toBe(false)
      expect(second.data?.[0].error_code).toBe('SLOT_UNAVAILABLE_INSTRUCTOR')
    })

    it('succeeds exactly 1 hour later (boundary is exclusive)', async () => {
      const first = await office.rpc('book_lesson', {
        p_instructor_id: instructorId,
        p_student_id: studentId,
        p_category: 'C',
        p_scheduled_at: '2099-07-07T10:00:00.000Z',
      })
      expect(first.data?.[0].ok).toBe(true)
      if (first.data?.[0].lesson_id) lessonIds.push(first.data[0].lesson_id)

      const second = await office.rpc('book_lesson', {
        p_instructor_id: instructorId,
        p_student_id: studentId,
        p_category: 'C',
        p_scheduled_at: '2099-07-07T11:00:00.000Z',
      })
      expect(second.data?.[0].ok).toBe(true)
      if (second.data?.[0].lesson_id) lessonIds.push(second.data[0].lesson_id)
    })
  })

  describe('student slot overlap', () => {
    it('rejects an overlapping slot for the same student with a different instructor', async () => {
      const otherInstructor = await seedInstructor(svc, {
        name: `test-instr-book-other-${Date.now()}`,
        categories: ['C'],
      })
      suiteCleanup.push({ table: 'instructors', id: otherInstructor.id })

      const scheduledAt = '2099-07-08T10:00:00.000Z'
      const first = await office.rpc('book_lesson', {
        p_instructor_id: instructorId,
        p_student_id: studentId,
        p_category: 'C',
        p_scheduled_at: scheduledAt,
      })
      expect(first.data?.[0].ok).toBe(true)
      if (first.data?.[0].lesson_id) lessonIds.push(first.data[0].lesson_id)

      const second = await office.rpc('book_lesson', {
        p_instructor_id: otherInstructor.id,
        p_student_id: studentId,
        p_category: 'C',
        p_scheduled_at: scheduledAt,
      })
      expect(second.data?.[0].ok).toBe(false)
      expect(second.data?.[0].error_code).toBe('SLOT_UNAVAILABLE_STUDENT')
    })
  })

  it('succeeds on a slot previously occupied by a cancelled lesson', async () => {
    const scheduledAt = '2099-07-09T10:00:00.000Z'
    const { data: cancelled, error: seedError } = await svc
      .from('lessons')
      .insert({
        instructor_id: instructorId,
        student_id: studentId,
        category: 'C',
        scheduled_at: scheduledAt,
        status: 'cancelled',
      })
      .select('id')
      .single()
    if (seedError) throw new Error(`seed cancelled lesson failed: ${seedError.message}`)
    if (cancelled) lessonIds.push(cancelled.id)

    const { data, error } = await office.rpc('book_lesson', {
      p_instructor_id: instructorId,
      p_student_id: studentId,
      p_category: 'C',
      p_scheduled_at: scheduledAt,
    })
    expect(error).toBeNull()
    expect(data?.[0].ok).toBe(true)
    if (data?.[0].lesson_id) lessonIds.push(data[0].lesson_id)
  })

  it('allows exactly one of two concurrent overlapping requests for the same instructor to succeed', async () => {
    const scheduledAt = '2099-07-10T10:00:00.000Z'
    const [a, b] = await Promise.all([
      office.rpc('book_lesson', {
        p_instructor_id: instructorId,
        p_student_id: studentId,
        p_category: 'C',
        p_scheduled_at: scheduledAt,
      }),
      office.rpc('book_lesson', {
        p_instructor_id: instructorId,
        p_student_id: studentId,
        p_category: 'C',
        p_scheduled_at: scheduledAt,
      }),
    ])

    const results = [a.data?.[0], b.data?.[0]]
    const succeeded = results.filter((r) => r?.ok === true)
    const failed = results.filter((r) => r?.ok === false)

    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0]?.error_code).toBe('SLOT_UNAVAILABLE_INSTRUCTOR')

    const winningId = succeeded[0]?.lesson_id
    if (winningId) lessonIds.push(winningId)
  })
})
