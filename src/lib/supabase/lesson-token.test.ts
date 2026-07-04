import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import {
  createTestServiceRoleClient,
  createTestAnonClient,
  seedInstructor,
  seedStudent,
  cleanupRows,
} from './test-client'

describe('lesson token RPCs — get_lesson_by_token / respond_to_lesson', () => {
  const db = createTestServiceRoleClient()
  const anon = createTestAnonClient()

  let instructorId: string
  let studentId: string
  const suiteCleanup: { table: string; id: string }[] = []
  let lessonIds: string[] = []

  beforeAll(async () => {
    const instructor = await seedInstructor(db, { name: `test-instr-token-${Date.now()}` })
    const student = await seedStudent(db, { name: `test-student-token-${Date.now()}` })
    instructorId = instructor.id
    studentId = student.id
    suiteCleanup.push(
      { table: 'instructors', id: instructorId },
      { table: 'students', id: studentId },
    )
  })

  afterEach(async () => {
    await cleanupRows(db, lessonIds.map((id) => ({ table: 'lessons', id })))
    lessonIds = []
  })

  afterAll(async () => {
    await cleanupRows(db, suiteCleanup)
  })

  async function seedPendingLessonWithToken(scheduledAt: string) {
    const { data, error } = await db
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
    lessonIds.push(data.id)
    return data as { id: string; token: string }
  }

  it('get_lesson_by_token resolves a pending lesson by its token', async () => {
    const lesson = await seedPendingLessonWithToken('2099-05-01T10:00:00.000Z')

    const { data, error } = await anon.rpc('get_lesson_by_token', { p_token: lesson.token })

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].id).toBe(lesson.id)
  })

  it('get_lesson_by_token returns nothing for an unknown token', async () => {
    const { data, error } = await anon.rpc('get_lesson_by_token', {
      p_token: '00000000-0000-0000-0000-000000000000',
    })

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('respond_to_lesson confirms a pending lesson and nulls its token', async () => {
    const lesson = await seedPendingLessonWithToken('2099-05-02T10:00:00.000Z')

    const { data, error } = await anon.rpc('respond_to_lesson', {
      p_token: lesson.token,
      p_decision: 'confirmed',
    })

    expect(error).toBeNull()
    expect(data?.[0].ok).toBe(true)

    const { data: row } = await db
      .from('lessons')
      .select('status, token')
      .eq('id', lesson.id)
      .single()
    expect(row?.status).toBe('confirmed')
    expect(row?.token).toBeNull()
  })

  it('respond_to_lesson rejects reuse of an already-consumed token', async () => {
    const lesson = await seedPendingLessonWithToken('2099-05-03T10:00:00.000Z')

    const first = await anon.rpc('respond_to_lesson', {
      p_token: lesson.token,
      p_decision: 'rejected',
    })
    expect(first.data?.[0].ok).toBe(true)

    const second = await anon.rpc('respond_to_lesson', {
      p_token: lesson.token,
      p_decision: 'confirmed',
    })
    expect(second.error).toBeNull()
    expect(second.data?.[0].ok).toBe(false)
  })
})
