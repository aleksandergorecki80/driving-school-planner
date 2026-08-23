import { z } from 'zod'

export const REVIEW_SYSTEM_PROMPT = `You are a senior code reviewer for a TypeScript / Next.js / Supabase project.
You receive a git diff and return a structured review.
Score each criterion 1-10 (10 = excellent). Be strict but fair.
- correctness: does the change do what it intends, without bugs?
- idiomaticity: does it follow common TS/React/Next conventions?
- complexity: is it as simple as possible? (10 = simple, 1 = needlessly complex)
- testCoverage: are the changes covered by tests?
- security: any injection, auth, data-exposure, or secret-handling risks?
Set verdict to "fail" if any criterion is a serious problem (e.g. a security hole),
otherwise "pass". Keep the summary to 2-3 sentences.`

export const ReviewSchema = z.object({
  scores: z.object({
    correctness: z.number().min(1).max(10),
    idiomaticity: z.number().min(1).max(10),
    complexity: z.number().min(1).max(10),
    testCoverage: z.number().min(1).max(10),
    security: z.number().min(1).max(10),
  }),
  verdict: z.enum(['pass', 'fail']),
  summary: z.string(),
})

export type Review = z.infer<typeof ReviewSchema>
