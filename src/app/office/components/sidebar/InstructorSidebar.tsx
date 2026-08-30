'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/theme-toggle'

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
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="px-2 text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          DrivePlan
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <label htmlFor="category-filter" className="mb-1 block px-2 text-xs text-sidebar-foreground/70">
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
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarMenu>
            {visibleInstructors.length === 0 && (
              <li className="px-4 py-3 text-sm text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
                No instructors found
              </li>
            )}
            {visibleInstructors.map((instructor) => (
              <SidebarMenuItem key={instructor.id}>
                <SidebarMenuButton
                  type="button"
                  isActive={selectedId === instructor.id}
                  tooltip={instructor.name}
                  onClick={() => handleInstructorClick(instructor.id)}
                >
                  <User />
                  <span>{instructor.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm" className="group-data-[collapsible=icon]:hidden">
              Log out
            </Button>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
