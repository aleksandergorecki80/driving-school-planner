'use client'
import { useRef, useState } from 'react'
import { respondToLesson, suggestRejectionReasonsAction } from '@/app/actions/lessons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  token: string
  scheduledAt: string
  category: string
}

type Step = 'idle' | 'confirming-approve' | 'confirming-reject'

export default function LessonResponseForm({ token, scheduledAt, category }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [reason, setReason] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const suggestionRequestId = useRef(0)

  function openRejectStep() {
    setStep('confirming-reject')
    setReason('')
    setSuggestions([])
    // Fire-and-forget: never awaited by the submit path below, so a slow/failed
    // suggestion call can never block or disable rejecting via free text (FR-012).
    const requestId = ++suggestionRequestId.current
    suggestRejectionReasonsAction({ scheduledAt, category })
      .then((result) => {
        if (requestId === suggestionRequestId.current) setSuggestions(result)
      })
      .catch(() => {
        if (requestId === suggestionRequestId.current) setSuggestions([])
      })
  }

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
            onClick={openRejectStep}
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
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setReason(suggestion)}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Reason (optional)</span>
            <Textarea
              name="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
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
