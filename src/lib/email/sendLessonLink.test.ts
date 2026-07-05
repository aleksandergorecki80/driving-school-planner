import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function MockResend() {
    return { emails: { send: sendMock } }
  }),
}))

import { sendLessonLink } from './sendLessonLink'

describe('sendLessonLink', () => {
  beforeEach(() => {
    sendMock.mockReset()
  })

  it('resolves {} on a successful send', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null })

    const result = await sendLessonLink('instructor@example.com', 'http://localhost:3000/lesson/abc')

    expect(result).toEqual({})
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'instructor@example.com',
        subject: expect.any(String),
        html: expect.stringContaining('http://localhost:3000/lesson/abc'),
      }),
    )
  })

  it('returns { error } without throwing when Resend returns an error', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'Invalid from address', statusCode: 422, name: 'invalid_from_address' },
    })

    const result = await sendLessonLink('instructor@example.com', 'http://localhost:3000/lesson/abc')

    expect(result).toEqual({ error: 'Invalid from address' })
  })

  it('returns { error } without throwing when the SDK call itself throws', async () => {
    sendMock.mockRejectedValue(new Error('network down'))

    const result = await sendLessonLink('instructor@example.com', 'http://localhost:3000/lesson/abc')

    expect(result).toEqual({ error: 'network down' })
  })

  it('does not throw at import time when RESEND_API_KEY is missing (production incident regression)', async () => {
    // Regression: a module-level `if (!apiKey) throw` here crashes at import time, which —
    // because this module is re-exported through the barreled src/app/actions/lessons/index.ts —
    // takes down every sibling action (e.g. cancelLesson) the moment any environment is missing
    // this var, not just the email-sending path. The check must live inside the function.
    const originalKey = process.env.RESEND_API_KEY
    const originalFrom = process.env.EMAIL_FROM
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
    vi.resetModules()

    try {
      const freshModule = await import('./sendLessonLink')
      const result = await freshModule.sendLessonLink(
        'instructor@example.com',
        'http://localhost:3000/lesson/abc',
      )
      expect(result.error).toBeDefined()
    } finally {
      process.env.RESEND_API_KEY = originalKey
      process.env.EMAIL_FROM = originalFrom
      vi.resetModules()
    }
  })
})
