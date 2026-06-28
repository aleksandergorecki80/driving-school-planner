import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import InstructorSidebar from './InstructorSidebar'

interface PageProps {
  searchParams: Promise<{
    instructor?: string
    week?: string       // YYYY-MM-DD, Monday
    category?: string
  }>
}

// Supabase returns the students join as an array even for many-to-one FK.
export type LessonRow = {
  id: string
  scheduled_at: string
  status: 'pending' | 'confirmed' | 'rejected'
  category: string
  students: { name: string }[]
}

// Derive the Monday of the week. weekParam is expected as YYYY-MM-DD (UTC).
function getWeekStart(weekParam: string | undefined): Date {
  if (weekParam) {
    const d = new Date(weekParam + 'T00:00:00.000Z')
    if (!isNaN(d.getTime())) return d
  }
  const now = new Date()
  const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday))
}

export default async function OfficePage({ searchParams }: PageProps) {
  const { instructor: instructorId, week: weekParam, category } = await searchParams

  const db = await createClient()

  // Fetch all instructors — category filtering happens client-side in the sidebar
  // so the category dropdown always shows the full set of categories.
  const { data: instructors } = await db
    .from('instructors')
    .select('id, name, categories')
    .order('name')

  // Fetch lessons for the selected instructor and week
  let lessons: LessonRow[] = []
  if (instructorId) {
    const weekStart = getWeekStart(weekParam)
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { data } = await db
      .from('lessons')
      .select('id, scheduled_at, status, category, students(name)')
      .eq('instructor_id', instructorId)
      .neq('status', 'cancelled')
      .gte('scheduled_at', weekStart.toISOString())
      .lt('scheduled_at', weekEnd.toISOString())

    lessons = data ?? []
  }

  return (
    <div className="flex h-[calc(100vh-56px)] gap-0">
      <Suspense>
        <InstructorSidebar
          instructors={instructors ?? []}
          selectedId={instructorId}
          selectedCategory={category}
        />
      </Suspense>

      <div className="flex flex-1 flex-col overflow-hidden">
        {instructorId ? (
          // WeeklyCalendar lands here in Phase 4; lessons are fetched and ready.
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
            Calendar coming in Phase 4
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
            Select an instructor to view their schedule
          </div>
        )}
      </div>
    </div>
  )
}
