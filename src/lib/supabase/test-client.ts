import { createClient } from '@supabase/supabase-js'

export function createTestServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export function createTestAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

type ServiceClient = ReturnType<typeof createTestServiceRoleClient>

export async function seedInstructor(
  client: ServiceClient,
  overrides: { name?: string; categories?: string[] } = {},
) {
  const { data, error } = await client
    .from('instructors')
    .insert({
      name: overrides.name ?? `test-instructor-${crypto.randomUUID()}`,
      categories: overrides.categories ?? ['B'],
    })
    .select('id, token, name, categories')
    .single()
  if (error) throw new Error(`seedInstructor failed: ${error.message}`)
  return data as { id: string; token: string; name: string; categories: string[] }
}

export async function seedStudent(
  client: ServiceClient,
  overrides: { name?: string; phone?: string; category?: string } = {},
) {
  const { data, error } = await client
    .from('students')
    .insert({
      name: overrides.name ?? `test-student-${crypto.randomUUID()}`,
      phone: overrides.phone ?? '000-000-0000',
      category: overrides.category ?? 'B',
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedStudent failed: ${error.message}`)
  return data as { id: string }
}

export async function seedLesson(
  client: ServiceClient,
  instructorId: string,
  studentId: string,
  overrides: { category?: string; scheduled_at?: string; status?: string } = {},
) {
  const { data, error } = await client
    .from('lessons')
    .insert({
      instructor_id: instructorId,
      student_id: studentId,
      category: overrides.category ?? 'B',
      scheduled_at: overrides.scheduled_at ?? new Date().toISOString(),
      status: overrides.status ?? 'pending',
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedLesson failed: ${error.message}`)
  return data as { id: string }
}

export async function cleanupRows(
  client: ServiceClient,
  rows: { table: string; id: string }[],
) {
  for (const { table, id } of rows) {
    const { error } = await client.from(table as 'lessons' | 'instructors' | 'students').delete().eq('id', id)
    if (error) {
      console.warn(`cleanupRows: failed to delete ${table}/${id}: ${error.message}`)
    }
  }
}
