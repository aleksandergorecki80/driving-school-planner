'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createLesson } from '@/app/actions/lessons'
import type { StudentRow } from '../types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DetailRow } from '@/components/lesson/DetailRow'
import { OverrideEmailField } from '@/components/lesson/OverrideEmailField'
import { formatLessonDateTime } from '@/lib/format-lesson-datetime'

interface Props {
  instructor: { id: string; name: string; categories: string[]; email: string | null }
  slot: Date
  students: StudentRow[]
  activeCategory?: string
  onSuccess: () => void
  onClose: () => void
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
  // Select popups default to portaling into document.body, which the vaul Drawer's
  // modal mode treats as "outside" and immediately closes on open — pointing the
  // portal container at this form's own root (inside the drawer) fixes that. State
  // (not a plain ref) is required: the container must trigger a re-render once the
  // DOM node exists, or Select's portal can capture a stale null on first paint.
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)

  const categories = instructor.categories.slice().sort()
  const initialCategory =
    activeCategory && categories.includes(activeCategory) ? activeCategory : (categories[0] ?? '')
  const [selectedCategory, setSelectedCategory] = useState(initialCategory)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [useOverrideEmail, setUseOverrideEmail] = useState(false)

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

    const overrideEmailValue = formData.get('overrideEmail')
    const overrideEmail =
      useOverrideEmail && typeof overrideEmailValue === 'string' && overrideEmailValue.trim()
        ? overrideEmailValue.trim()
        : undefined

    startTransition(async () => {
      setError(null)
      const result = await createLesson({
        instructorId: instructor.id,
        studentId,
        category,
        scheduledAt: slot.toISOString(),
        overrideEmail,
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
    <div ref={setRootEl} className="flex flex-col h-full">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">New Lesson</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X />
        </Button>
      </div>

      <form action={handleAction} className="flex flex-col gap-4 overflow-y-auto p-4">
        <DetailRow label="Instructor" value={instructor.name} />
        <DetailRow label="Slot" value={formatLessonDateTime(slot)} />

        <div>
          <Label htmlFor="nl-category" className="mb-1">
            Category
          </Label>
          <input type="hidden" name="category" value={selectedCategory} />
          <Select
            value={selectedCategory}
            onValueChange={(value) => {
              setSelectedCategory(value ?? '')
              setSelectedStudentId('')
            }}
            disabled={isPending}
            modal={false}
          >
            <SelectTrigger id="nl-category" className="w-full">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent container={rootEl} alignItemWithTrigger={false}>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="nl-student" className="mb-1">
            Student
          </Label>
          <input type="hidden" name="studentId" value={selectedStudentId} />
          <Select
            value={selectedStudentId}
            onValueChange={(value) => setSelectedStudentId(value ?? '')}
            disabled={isPending || filteredStudents.length === 0}
            modal={false}
            items={filteredStudents.map((s) => ({ label: s.name, value: s.id }))}
          >
            <SelectTrigger id="nl-student" className="w-full">
              <SelectValue
                placeholder={
                  filteredStudents.length === 0 ? 'No students in this category' : 'Select a student'
                }
              />
            </SelectTrigger>
            <SelectContent container={rootEl} alignItemWithTrigger={false}>
              {filteredStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <OverrideEmailField
          targetEmail={instructor.email}
          checked={useOverrideEmail}
          onCheckedChange={setUseOverrideEmail}
          disabled={isPending}
          checkboxLabel="Send to a different email for this lesson only"
          inputName="overrideEmail"
        />

        {error && <p className="text-xs text-destructive">{error}</p>}

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
