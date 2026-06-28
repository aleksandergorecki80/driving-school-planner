// Shared types for the office lesson calendar.
// lessons.student_id → students.id is many-to-one; PostgREST embeds as an object, not an array.
export type LessonRow = {
  id: string
  scheduled_at: string
  status: 'pending' | 'confirmed' | 'rejected'
  category: string
  students: { name: string } | null
}

export type StudentRow = {
  id: string
  name: string
  category: string
}
