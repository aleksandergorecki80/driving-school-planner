'use client'
import { useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  targetEmail: string | null
  disabled?: boolean
  editAriaLabel: string
  onOverrideChange: (value: string | undefined) => void
}

export function OverrideEmailField({
  targetEmail,
  disabled,
  editAriaLabel,
  onOverrideChange,
}: Props) {
  const [committedValue, setCommittedValue] = useState<string | undefined>(undefined)
  const [isEditing, setIsEditing] = useState(false)
  const [draftValue, setDraftValue] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isCancellingRef = useRef(false)

  const displayValue = committedValue ?? targetEmail

  function startEditing() {
    if (disabled) return
    setDraftValue(committedValue ?? targetEmail ?? '')
    setValidationError(null)
    setIsEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function commit() {
    if (isCancellingRef.current) return

    const trimmed = draftValue.trim()

    if (trimmed && inputRef.current && !inputRef.current.checkValidity()) {
      setValidationError('Enter a valid email address')
      return
    }

    const original = (targetEmail ?? '').trim()
    const nextOverride = trimmed && trimmed !== original ? trimmed : undefined

    setCommittedValue(nextOverride)
    onOverrideChange(nextOverride)
    setValidationError(null)
    setIsEditing(false)
  }

  function cancel() {
    isCancellingRef.current = true
    setDraftValue(committedValue ?? targetEmail ?? '')
    setValidationError(null)
    setIsEditing(false)
    inputRef.current?.blur()
    isCancellingRef.current = false
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">Link will be sent to</p>

      <div className="mt-1 flex items-center gap-1 rounded-lg border border-input bg-transparent px-2.5 py-1 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50">
        {isEditing ? (
          <Input
            ref={inputRef}
            type="email"
            value={draftValue}
            onChange={(e) => {
              setDraftValue(e.target.value)
              setValidationError(null)
            }}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            placeholder="one-off@example.com"
            disabled={disabled}
            className="h-6 border-0 p-0 focus-visible:ring-0"
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={startEditing}
            disabled={disabled}
            className="h-6 flex-1 justify-start truncate rounded-none border-none p-0 text-left text-sm font-medium text-foreground"
          >
            {displayValue ?? 'No email on file'}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={startEditing}
          disabled={disabled}
          aria-label={editAriaLabel}
          className="size-6 shrink-0"
        >
          <Pencil className="size-3.5" />
        </Button>
      </div>

      {validationError && <p className="mt-1 text-xs text-destructive">{validationError}</p>}
    </div>
  )
}
