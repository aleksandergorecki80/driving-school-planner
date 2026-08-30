'use client'
import { useActionState } from 'react'
import { loginAction } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function LoginForm({ next }: { next: string }) {
  const [errorMessage, dispatch, isPending] = useActionState(loginAction, null)

  return (
    <form action={dispatch}>
      <input type="hidden" name="next" value={next} />

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="text" name="email" autoFocus required />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" type="password" name="password" required />
        </Field>

        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <Field>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Logging in…' : 'Log in'}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
