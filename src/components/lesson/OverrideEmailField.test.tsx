// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { OverrideEmailField } from './OverrideEmailField'

const EDIT_LABEL = 'Send to a different email for this lesson only'

describe('OverrideEmailField', () => {
  afterEach(() => {
    cleanup()
  })

  it('clicking the pencil enters edit mode pre-filled with the current email', () => {
    const { getByRole } = render(
      <OverrideEmailField
        targetEmail="instructor@example.com"
        editAriaLabel={EDIT_LABEL}
        onOverrideChange={vi.fn()}
      />,
    )

    fireEvent.click(getByRole('button', { name: EDIT_LABEL }))

    const input = getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('instructor@example.com')
  })

  it('typing a new value and blurring commits it and calls onOverrideChange', () => {
    const onOverrideChange = vi.fn()
    const { getByRole } = render(
      <OverrideEmailField
        targetEmail="instructor@example.com"
        editAriaLabel={EDIT_LABEL}
        onOverrideChange={onOverrideChange}
      />,
    )

    fireEvent.click(getByRole('button', { name: EDIT_LABEL }))
    const input = getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'one-off@example.com' } })
    fireEvent.blur(input)

    expect(onOverrideChange).toHaveBeenCalledWith('one-off@example.com')
  })

  it('committing the original email back reports no override', () => {
    const onOverrideChange = vi.fn()
    const { getByRole } = render(
      <OverrideEmailField
        targetEmail="instructor@example.com"
        editAriaLabel={EDIT_LABEL}
        onOverrideChange={onOverrideChange}
      />,
    )

    fireEvent.click(getByRole('button', { name: EDIT_LABEL }))
    const input = getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'instructor@example.com' } })
    fireEvent.blur(input)

    expect(onOverrideChange).toHaveBeenCalledWith(undefined)
  })

  it('pressing Escape reverts the draft and exits edit mode without committing', () => {
    const onOverrideChange = vi.fn()
    const { getByRole, queryByRole } = render(
      <OverrideEmailField
        targetEmail="instructor@example.com"
        editAriaLabel={EDIT_LABEL}
        onOverrideChange={onOverrideChange}
      />,
    )

    fireEvent.click(getByRole('button', { name: EDIT_LABEL }))
    const input = getByRole('textbox') as HTMLInputElement
    // Establish real DOM focus, matching the real browser sequence (startEditing's
    // rAF-scheduled focus() never fires in jsdom without an explicit flush) — this is
    // what actually triggers the blur/cancel race being tested here.
    input.focus()
    fireEvent.change(input, { target: { value: 'oops@example.com' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onOverrideChange).not.toHaveBeenCalled()
    expect(queryByRole('textbox')).toBeNull()
    expect(getByRole('button', { name: 'instructor@example.com' })).not.toBeNull()
  })

  it('an invalid email blocks commit, shows an inline error, and stays in edit mode', () => {
    const onOverrideChange = vi.fn()
    const { getByRole, getByText } = render(
      <OverrideEmailField
        targetEmail="instructor@example.com"
        editAriaLabel={EDIT_LABEL}
        onOverrideChange={onOverrideChange}
      />,
    )

    fireEvent.click(getByRole('button', { name: EDIT_LABEL }))
    const input = getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'not-an-email' } })
    fireEvent.blur(input)

    expect(onOverrideChange).not.toHaveBeenCalled()
    expect(getByText('Enter a valid email address')).not.toBeNull()
    expect(getByRole('textbox')).not.toBeNull()
  })

  it('shows "No email on file" and opens an empty editable field when there is no target email', () => {
    const { getByRole } = render(
      <OverrideEmailField
        targetEmail={null}
        editAriaLabel={EDIT_LABEL}
        onOverrideChange={vi.fn()}
      />,
    )

    expect(getByRole('button', { name: 'No email on file' })).not.toBeNull()

    fireEvent.click(getByRole('button', { name: EDIT_LABEL }))
    const input = getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('')
  })
})
