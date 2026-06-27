import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InstructorPage({ params }: Props) {
  const { token } = await params

  const db = createServiceClient()
  const { data: instructor } = await db
    .from('instructors')
    .select('id, name')
    .eq('token', token)
    .maybeSingle()

  if (!instructor) {
    notFound()
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-zinc-900">
        Instructor: {instructor.name}
      </h1>
      <p className="mt-2 text-zinc-500">Lesson schedule coming soon.</p>
    </main>
  )
}
