import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createTestServiceRoleClient,
  seedInstructor,
  seedStudent,
  cleanupRows,
} from '@/lib/supabase/test-client'
import { respondToLesson } from '@/app/actions/lessons'
import LessonPage from './page'

describe('/lesson/[token] page', () => {
  const db = createTestServiceRoleClient()

  let instructorId: string
  let studentId: string
  let studentName: string
  const suiteCleanup: { table: string; id: string }[] = []
  const lessonCleanup: { table: string; id: string }[] = []

  beforeAll(async () => {
    studentName = `test-student-page-${Date.now()}`
    const instructor = await seedInstructor(db, { name: `test-instr-page-${Date.now()}` })
    const student = await seedStudent(db, { name: studentName })
    instructorId = instructor.id
    studentId = student.id
    suiteCleanup.push(
      { table: 'instructors', id: instructorId },
      { table: 'students', id: studentId },
    )
  })

  afterAll(async () => {
    await cleanupRows(db, lessonCleanup)
    await cleanupRows(db, suiteCleanup)
  })

  async function seedPendingLesson(scheduledAt: string) {
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
    lessonCleanup.push({ table: 'lessons', id: data.id })
    return data as { id: string; token: string }
  }

  it('shows the lesson category and student name for a valid pending token', async () => {
    const lesson = await seedPendingLesson('2099-07-01T10:00:00.000Z')

    const element = await LessonPage({ params: Promise.resolve({ token: lesson.token }) })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('B')
    expect(html).toContain(studentName)
    expect(html).not.toContain('no longer valid')
  })

  it('shows a "link is no longer valid" message for an unknown token', async () => {
    const element = await LessonPage({
      params: Promise.resolve({ token: '00000000-0000-0000-0000-000000000000' }),
    })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('no longer valid')
  })

  it('shows a "link is no longer valid" message for a malformed (non-UUID) token', async () => {
    const element = await LessonPage({ params: Promise.resolve({ token: 'not-a-uuid' }) })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('no longer valid')
  })

  it('shows a "link is no longer valid" message once the token has been consumed', async () => {
    const lesson = await seedPendingLesson('2099-07-02T10:00:00.000Z')
    const response = await respondToLesson(lesson.token, 'confirmed')
    expect(response).toEqual({})

    const element = await LessonPage({ params: Promise.resolve({ token: lesson.token }) })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('no longer valid')
  })
})
