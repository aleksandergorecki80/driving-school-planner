// Shared types for the office lesson calendar.
// Supabase returns the students join as an array even for many-to-one FK.
export type LessonRow = {
  id: string
  scheduled_at: string
  status: 'pending' | 'confirmed' | 'rejected'
  category: string
  students: { name: string }[]
}
