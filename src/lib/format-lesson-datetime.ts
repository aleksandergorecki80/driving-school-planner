export function formatLessonDateTime(input: string | Date): string {
  const dt = typeof input === 'string' ? new Date(input) : input

  const date = dt.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const time = dt.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  return `${date} at ${time}`
}
