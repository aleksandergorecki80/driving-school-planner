import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { ApiProvider, ProviderResponse } from 'promptfoo'
import { REVIEW_SYSTEM_PROMPT, ReviewSchema } from '../review-schema'

interface CodeReviewProviderOptions {
  id?: string
  config?: { model?: string }
}

export default class CodeReviewProvider implements ApiProvider {
  private readonly providerId: string
  private readonly model: string

  constructor(options: CodeReviewProviderOptions) {
    this.providerId = options.id ?? 'code-review-agent'
    this.model = options.config?.model ?? 'gpt-5.4-nano'
  }

  id(): string {
    return this.providerId
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const { output } = await generateText({
      model: openai(this.model),
      system: REVIEW_SYSTEM_PROMPT,
      output: Output.object({ schema: ReviewSchema }),
      prompt: `Review this git diff:\n\n${prompt}`,
      abortSignal: AbortSignal.timeout(60_000),
    })

    return { output: JSON.stringify(output) }
  }
}
