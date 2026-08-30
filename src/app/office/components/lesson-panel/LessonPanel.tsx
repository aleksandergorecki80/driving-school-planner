'use client'
import { useState } from 'react'
import type { LessonRow, StudentRow } from '../types'
import WeeklyCalendar from '../calendar/WeeklyCalendar'
import NewLessonForm from './NewLessonForm'
import LessonPopover from './LessonPopover'
import { Drawer, DrawerContent } from '@/components/ui/drawer'

interface Props {
  instructor: { id: string; name: string; categories: string[]; email: string | null }
  lessons: LessonRow[]
  weekStart: string // YYYY-MM-DD (UTC Monday)
  availableStudents: StudentRow[]
  activeCategory?: string
}

export default function LessonPanel({
  instructor,
  lessons,
  weekStart,
  availableStudents,
  activeCategory,
}: Props) {
  const [mode, setMode] = useState<'idle' | 'create' | 'detail'>('idle')
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null)
  const [selectedLesson, setSelectedLesson] = useState<LessonRow | null>(null)

  function handleSlotClick(date: Date) {
    setSelectedSlot(date)
    setSelectedLesson(null)
    setMode('create')
  }

  function handleLessonClick(lesson: LessonRow) {
    setSelectedLesson(lesson)
    setSelectedSlot(null)
    setMode('detail')
  }

  function closePanel() {
    setMode('idle')
    setSelectedSlot(null)
    setSelectedLesson(null)
  }

  const isOpen = mode !== 'idle'

  return (
    <div className="relative flex flex-1 overflow-hidden">
      <WeeklyCalendar
        instructor={instructor}
        lessons={lessons}
        weekStart={weekStart}
        onSlotClick={handleSlotClick}
        onLessonClick={handleLessonClick}
      />

      <Drawer direction="right" open={isOpen} onOpenChange={(open) => !open && closePanel()}>
        <DrawerContent aria-label={mode === 'create' ? 'New lesson' : 'Lesson details'}>
          {mode === 'create' && selectedSlot !== null ? (
            <NewLessonForm
              instructor={instructor}
              slot={selectedSlot}
              students={availableStudents}
              activeCategory={activeCategory}
              onSuccess={closePanel}
              onClose={closePanel}
            />
          ) : mode === 'detail' && selectedLesson !== null ? (
            <LessonPopover instructor={instructor} lesson={selectedLesson} onClose={closePanel} />
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
