import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'

const SuggestionSchema = z.object({
  reasons: z.array(z.string()).max(5),
})

export async function suggestRejectionReasons(input: {
  scheduledAt: string
  category: string
}): Promise<string[]> {
  try {
    const modelId = process.env.AI_SUGGESTION_MODEL ?? 'gpt-5.4-nano'

    const { output } = await generateText({
      model: openai(modelId),
      output: Output.object({ schema: SuggestionSchema }),
      prompt:
        'Suggest up to 5 short, professional reasons an instructor might give for rejecting a ' +
        `driving lesson scheduled for ${input.scheduledAt} in category "${input.category}". ` +
        'Keep each reason generic and free of any personal or identifying details.',
      abortSignal: AbortSignal.timeout(10_000),
    })

    return output.reasons
  } catch (err) {
    // Swallowed by design (FR-012 graceful degradation) — logged so a real outage
    // (bad key, wrong model id, timeout) is still visible in server logs and Sentry.
    console.error('suggestRejectionReasons failed:', err)
    Sentry.captureException(err)
    return []
  }
}
