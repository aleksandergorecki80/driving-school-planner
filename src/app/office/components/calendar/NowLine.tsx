'use client'
import { computeNowLineTop } from './now-line'

interface Props {
  day: Date
  now: Date
  gridColumn: number
}

export default function NowLine({ day, now, gridColumn }: Props) {
  const top = computeNowLineTop(day, now)
  if (top === null) return null

  return (
    <div
      aria-hidden="true"
      data-testid="now-line"
      className="pointer-events-none relative z-20"
      style={{ gridRow: '2 / -1', gridColumn }}
    >
      {/* Blue is deliberate — amber/emerald/red are all taken by lesson status (see lesson-status.ts) */}
      <div
        data-testid="now-line-marker"
        className="absolute inset-x-0 -translate-y-1/2 transition-[top] duration-300 motion-reduce:transition-none"
        style={{ top: `${top * 100}%` }}
      >
        <div className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 dark:bg-blue-400" />
        <div className="h-0.5 w-full bg-blue-500 dark:bg-blue-400" />
      </div>
    </div>
  )
}
