import { ReviewSchema } from '../../review-schema'

interface AssertionResult {
  pass: boolean
  score: number
  reason: string
}

export default function assertValidSchema(output: string): AssertionResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch (err) {
    return { pass: false, score: 0, reason: `Output is not valid JSON: ${String(err)}` }
  }

  const result = ReviewSchema.safeParse(parsed)
  if (!result.success) {
    return {
      pass: false,
      score: 0,
      reason: `Output does not conform to ReviewSchema: ${result.error.message}`,
    }
  }

  return { pass: true, score: 1, reason: 'Output conforms to ReviewSchema' }
}
