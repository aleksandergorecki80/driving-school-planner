'use client'
import { useState } from 'react'
import type { LessonRow, StudentRow } from '../types'
import WeeklyCalendar from '../calendar/WeeklyCalendar'
import NewLessonForm from './NewLessonForm'
import LessonPopover from './LessonPopover'

interface Props {
  instructor: { id: string; name: string; categories: string[] }
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

      {/* Slide-in drawer — sits below the 56px nav bar */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? 'New lesson' : 'Lesson details'}
        className={`fixed right-0 top-14 z-30 flex h-[calc(100vh-3.5rem)] w-96 flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
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
      </div>
    </div>
  )
}
