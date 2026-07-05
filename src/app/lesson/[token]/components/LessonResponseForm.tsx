'use client'
import { useState } from 'react'
import { respondToLesson } from '@/app/actions/lessons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  token: string
}

type Step = 'idle' | 'confirming-approve' | 'confirming-reject'

export default function LessonResponseForm({ token }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(decision: 'confirmed' | 'rejected', reason?: string) {
    setIsSubmitting(true)
    setError(null)
    const result = await respondToLesson(token, decision, reason)
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      setDone(true)
    }
  }

  async function handleRejectSubmit(formData: FormData) {
    const rawReason = formData.get('reason')
    const reason = typeof rawReason === 'string' && rawReason.trim() ? rawReason.trim() : undefined
    await submit('rejected', reason)
  }

  if (done) {
    return <p className="text-sm text-zinc-600">Thanks, your response has been recorded.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-xs text-red-600">{error}</p>}

      {step === 'idle' && (
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => setStep('confirming-approve')}
            className="flex-1"
          >
            Approve
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setStep('confirming-reject')}
            className="flex-1"
          >
            Reject
          </Button>
        </div>
      )}

      {step === 'confirming-approve' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-zinc-700">Are you sure you want to approve this lesson?</p>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => submit('confirmed')}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? 'Confirming…' : 'Yes, approve'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('idle')}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === 'confirming-reject' && (
        <form action={handleRejectSubmit} className="flex flex-col gap-2">
          <p className="text-sm text-zinc-700">Are you sure you want to reject this lesson?</p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Reason (optional)</span>
            <Textarea name="reason" rows={3} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? 'Rejecting…' : 'Yes, reject'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep('idle')}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
