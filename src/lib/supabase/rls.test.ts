import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestServiceRoleClient,
  createTestAnonClient,
  seedInstructor,
  seedStudent,
  seedLesson,
  cleanupRows,
} from './test-client'

describe('Risk #1 — Instructor token IDOR protection (data layer)', () => {
  const db = createTestServiceRoleClient()
  const anon = createTestAnonClient()

  let instructorA: { id: string; token: string }
  let instructorB: { id: string; token: string }
  let student: { id: string }
  let lessonA: { id: string }
  let lessonB: { id: string }
  const cleanup: { table: string; id: string }[] = []

  beforeAll(async () => {
    student = await seedStudent(db)
    instructorA = await seedInstructor(db)
    instructorB = await seedInstructor(db)
    lessonA = await seedLesson(db, instructorA.id, student.id)
    lessonB = await seedLesson(db, instructorB.id, student.id)
    cleanup.push(
      { table: 'lessons', id: lessonA.id },
      { table: 'lessons', id: lessonB.id },
      { table: 'instructors', id: instructorA.id },
      { table: 'instructors', id: instructorB.id },
      { table: 'students', id: student.id },
    )
  })

  afterAll(async () => {
    await cleanupRows(db, cleanup)
  })

  it('instructor A token returns only A lessons — not B lessons', async () => {
    const { data, error } = await anon.rpc('get_instructor_lessons', {
      p_token: instructorA.token,
    })
    expect(error).toBeNull()
    const ids = (data ?? []).map((row: { id: string }) => row.id)
    expect(ids).toContain(lessonA.id)
    expect(ids).not.toContain(lessonB.id) // IDOR: must NOT appear
  })

  it('instructor B token returns only B lessons — not A lessons', async () => {
    const { data, error } = await anon.rpc('get_instructor_lessons', {
      p_token: instructorB.token,
    })
    expect(error).toBeNull()
    const ids = (data ?? []).map((row: { id: string }) => row.id)
    expect(ids).toContain(lessonB.id)
    expect(ids).not.toContain(lessonA.id) // IDOR: must NOT appear
  })

  it('unknown token returns empty set — no data leakage', async () => {
    const { data, error } = await anon.rpc('get_instructor_lessons', {
      p_token: '00000000-0000-0000-0000-000000000000',
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})
