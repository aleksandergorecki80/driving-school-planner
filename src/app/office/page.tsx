import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import type { LessonRow } from './components/types'
import AutoRefresh from './components/AutoRefresh'
import InstructorSidebar from './components/sidebar/InstructorSidebar'
import LessonPanel from './components/lesson-panel/LessonPanel'

interface PageProps {
  searchParams: Promise<{
    instructor?: string
    week?: string       // YYYY-MM-DD, Monday
    category?: string
  }>
}

// Snaps any date to the Monday of its week (UTC).
function snapToMonday(d: Date): Date {
  const dayOfWeek = d.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysFromMonday))
}

// Derive the Monday of the week. weekParam is expected as YYYY-MM-DD (UTC);
// it is always snapped to its week's Monday, since callers (e.g. the week
// jump picker) may pass any day of the week, not just an already-aligned one.
function getWeekStart(weekParam: string | undefined): Date {
  if (weekParam) {
    const d = new Date(weekParam + 'T00:00:00.000Z')
    if (!isNaN(d.getTime())) return snapToMonday(d)
  }
  return snapToMonday(new Date())
}

export default async function OfficePage({ searchParams }: PageProps) {
  const { instructor: instructorId, week: weekParam, category } = await searchParams

  const db = await createClient()

  // Fetch all instructors — category filtering happens client-side in the sidebar
  // so the category dropdown always shows the full set of categories.
  const { data: instructors } = await db
    .from('instructors')
    .select('id, name, categories, email')
    .order('name')

  // Always compute weekStart so it can be passed to WeeklyCalendar regardless of instructor selection.
  const weekStart = getWeekStart(weekParam)
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Fetch lessons for the selected instructor and week
  let lessons: LessonRow[] = []
  if (instructorId) {
    const { data } = await db
      .from('lessons')
      .select('id, scheduled_at, status, category, rejection_reason, students(name)')
      .eq('instructor_id', instructorId)
      .neq('status', 'cancelled')
      .gte('scheduled_at', weekStart.toISOString())
      .lt('scheduled_at', weekEnd.toISOString())

    // Supabase infers students join as array, but PostgREST returns an object for
    // many-to-one FK (lessons.student_id → students.id). Cast to the correct shape.
    lessons = (data as LessonRow[] | null) ?? []
  }

  // When deactivated_at is added to students, add .is('deactivated_at', null) here.
  const { data: students } = await db
    .from('students')
    .select('id, name, category')
    .order('name')

  const selectedInstructor = instructors?.find((i) => i.id === instructorId)

  return (
    <>
      <AutoRefresh />
      <Suspense>
        <InstructorSidebar
          instructors={instructors ?? []}
          selectedId={instructorId}
          selectedCategory={category}
        />
      </Suspense>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <h1 className="sr-only">Office Dashboard</h1>
        </header>

        <div className="flex flex-1 flex-col overflow-hidden">
          {instructorId && selectedInstructor ? (
            <Suspense>
              <LessonPanel
                instructor={selectedInstructor}
                lessons={lessons}
                weekStart={weekStart.toISOString().slice(0, 10)}
                availableStudents={students ?? []}
                activeCategory={category}
              />
            </Suspense>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select an instructor to view their schedule
            </div>
          )}
        </div>
      </SidebarInset>
    </>
  )
}
