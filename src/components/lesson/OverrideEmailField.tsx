'use client'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  targetEmail: string | null
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  checkboxLabel: string
  inputName?: string
  inputValue?: string
  onInputChange?: (value: string) => void
}

export function OverrideEmailField({
  targetEmail,
  checked,
  onCheckedChange,
  disabled,
  checkboxLabel,
  inputName,
  inputValue,
  onInputChange,
}: Props) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">Link will be sent to</p>
      <p className="text-sm font-medium text-foreground">{targetEmail ?? 'No email on file'}</p>

      <Label className="mt-1 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          disabled={disabled}
        />
        {checkboxLabel}
      </Label>

      {checked && (
        <Input
          type="email"
          name={inputName}
          value={inputValue}
          onChange={onInputChange ? (e) => onInputChange(e.target.value) : undefined}
          placeholder="one-off@example.com"
          disabled={disabled}
          className="mt-1.5"
        />
      )}
    </div>
  )
}
