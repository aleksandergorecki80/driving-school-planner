import type { ReactNode } from 'react'

interface Props {
  label: string
  value: ReactNode
}

export function DetailRow({ label, value }: Props) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}
