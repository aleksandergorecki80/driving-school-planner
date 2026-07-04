'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createLesson } from '@/app/actions/lessons'
import type { StudentRow } from '../types'
import { Button } from '@/components/ui/button'

interface Props {
  instructor: { id: string; name: string; categories: string[] }
  slot: Date
  students: StudentRow[]
  activeCategory?: string
  onSuccess: () => void
  onClose: () => void
}

function formatSlot(slot: Date): string {
  const date = slot.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const time = slot.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  return `${date} at ${time}`
}

export default function NewLessonForm({
  instructor,
  slot,
  students,
  activeCategory,
  onSuccess,
  onClose,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const categories = instructor.categories.slice().sort()
  const initialCategory =
    activeCategory && categories.includes(activeCategory) ? activeCategory : (categories[0] ?? '')
  const [selectedCategory, setSelectedCategory] = useState(initialCategory)

  const filteredStudents = students.filter((s) => s.category === selectedCategory)

  function handleAction(formData: FormData) {
    if (isPending) return
    const category = formData.get('category')
    const studentId = formData.get('studentId')

    if (typeof category !== 'string' || !category) {
      setError('Please select a category')
      return
    }
    if (typeof studentId !== 'string' || !studentId) {
      setError('Please select a student')
      return
    }

    startTransition(async () => {
      setError(null)
      const result = await createLesson({
        instructorId: instructor.id,
        studentId,
        category,
        scheduledAt: slot.toISOString(),
      })
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
        onSuccess()
      }
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">New Lesson</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close panel"
          className="text-zinc-400 hover:text-zinc-700"
        >
          ✕
        </Button>
      </div>

      <form action={handleAction} className="flex flex-col gap-4 overflow-y-auto p-4">
        <div>
          <p className="text-xs text-zinc-500">Instructor</p>
          <p className="text-sm font-medium text-zinc-900">{instructor.name}</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500">Slot</p>
          <p className="text-sm font-medium text-zinc-900">{formatSlot(slot)}</p>
        </div>

        <div>
          <label htmlFor="nl-category" className="mb-1 block text-xs font-medium text-zinc-700">
            Category
          </label>
          <select
            id="nl-category"
            name="category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            disabled={isPending}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="nl-student" className="mb-1 block text-xs font-medium text-zinc-700">
            Student
          </label>
          <select
            id="nl-student"
            name="studentId"
            disabled={isPending || filteredStudents.length === 0}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
          >
            {filteredStudents.length === 0 ? (
              <option value="">No students in this category</option>
            ) : (
              filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
          </select>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="default"
            disabled={isPending || filteredStudents.length === 0}
            className="flex-1"
          >
            {isPending ? 'Booking…' : 'Book lesson'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
