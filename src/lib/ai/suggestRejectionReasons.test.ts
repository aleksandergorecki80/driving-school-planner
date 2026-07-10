import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }))

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
}))

import { suggestRejectionReasons } from './suggestRejectionReasons'

describe('suggestRejectionReasons', () => {
  beforeEach(() => {
    generateObjectMock.mockReset()
  })

  it('returns up to 5 reasons on a successful call', async () => {
    generateObjectMock.mockResolvedValue({
      object: { reasons: ['Instructor unavailable', 'Vehicle in maintenance'] },
    })

    const result = await suggestRejectionReasons({
      scheduledAt: '2099-01-15T10:00:00.000Z',
      category: 'B',
    })

    expect(result).toEqual(['Instructor unavailable', 'Vehicle in maintenance'])
  })

  it('never passes student-identifying input to the model call', async () => {
    generateObjectMock.mockResolvedValue({ object: { reasons: [] } })

    await suggestRejectionReasons({
      scheduledAt: '2099-01-15T10:00:00.000Z',
      category: 'B',
    })

    const callArgs = generateObjectMock.mock.calls[0][0]
    const serialized = JSON.stringify(callArgs)
    expect(serialized).not.toMatch(/student/i)
  })

  it('returns [] without throwing when the model call fails', async () => {
    generateObjectMock.mockRejectedValue(new Error('gateway timeout'))

    const result = await suggestRejectionReasons({
      scheduledAt: '2099-01-15T10:00:00.000Z',
      category: 'B',
    })

    expect(result).toEqual([])
  })

  it('logs the underlying error on failure so it is visible in server logs', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('gateway timeout')
    generateObjectMock.mockRejectedValue(failure)

    await suggestRejectionReasons({
      scheduledAt: '2099-01-15T10:00:00.000Z',
      category: 'B',
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String), failure)
    consoleErrorSpy.mockRestore()
  })
})
