import { ReviewSchema } from '../../review-schema'

interface AssertionResult {
  pass: boolean
  score: number
  reason: string
}

export default function assertBadDiffFails(output: string): AssertionResult {
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
      reason: `Cannot evaluate verdict — output does not conform to ReviewSchema: ${result.error.message}`,
    }
  }

  const review = result.data
  const pass = review.verdict === 'fail' && review.scores.security <= 5
  const reason = pass
    ? `Correctly flagged the injection: verdict=${review.verdict}, security=${review.scores.security}`
    : `Expected verdict 'fail' with security <= 5, got verdict=${review.verdict}, security=${review.scores.security}`

  return { pass, score: pass ? 1 : 0, reason }
}
