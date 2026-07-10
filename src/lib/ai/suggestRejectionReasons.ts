import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
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

    const { object } = await generateObject({
      model: openai(modelId),
      schema: SuggestionSchema,
      prompt:
        'Suggest up to 5 short, professional reasons an instructor might give for rejecting a ' +
        `driving lesson scheduled for ${input.scheduledAt} in category "${input.category}". ` +
        'Keep each reason generic and free of any personal or identifying details.',
      abortSignal: AbortSignal.timeout(5_000),
    })

    return object.reasons
  } catch {
    return []
  }
}
