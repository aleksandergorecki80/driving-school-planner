'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Instructor {
  id: string
  name: string
  categories: string[]
}

interface Props {
  instructors: Instructor[]
  selectedId?: string
  selectedCategory?: string
}

export default function InstructorSidebar({ instructors, selectedId, selectedCategory }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Derive unique sorted categories from ALL instructors (unfiltered) so the
  // dropdown always shows the full set regardless of the current selection.
  const categories = Array.from(
    new Set(instructors.flatMap((i) => i.categories)),
  ).sort()

  // Filter the displayed instructor list by the selected category client-side.
  const visibleInstructors = selectedCategory
    ? instructors.filter((i) => i.categories.includes(selectedCategory))
    : instructors

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    const qs = params.toString()
    return qs ? `/office?${qs}` : '/office'
  }

  function handleCategoryChange(value: string | null) {
    // Reset instructor when category changes — the current instructor may not teach this category
    router.push(buildUrl({ category: value || undefined, instructor: undefined }))
  }

  function handleInstructorClick(id: string) {
    router.push(buildUrl({ instructor: id }))
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col overflow-y-auto border-r border-zinc-200">
      <div className="p-3 border-b border-zinc-100">
        <label htmlFor="category-filter" className="block mb-1 text-xs text-zinc-500">
          Category
        </label>
        <Select value={selectedCategory ?? ''} onValueChange={handleCategoryChange}>
          <SelectTrigger id="category-filter" className="w-full">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ul className="flex-1">
        {visibleInstructors.length === 0 && (
          <li className="px-4 py-3 text-sm text-zinc-400">No instructors found</li>
        )}
        {visibleInstructors.map((instructor) => (
          <li key={instructor.id}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleInstructorClick(instructor.id)}
              className={cn(
                'h-auto w-full justify-start rounded-none px-4 py-2 text-left text-sm',
                selectedId === instructor.id
                  ? 'bg-zinc-100 font-medium text-zinc-900'
                  : 'text-zinc-700',
              )}
            >
              {instructor.name}
            </Button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
