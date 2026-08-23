import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import { ReviewSchema, REVIEW_SYSTEM_PROMPT } from './review-schema'

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  const diff = (await readStdin()).trim()
  if (!diff) {
    console.error(
      'Brak diffa na stdin. Użycie: git diff | npx tsx --env-file=.env.local tools/code-review/review.ts',
    )
    process.exit(1)
  }

  const modelId = process.env.AI_SUGGESTION_MODEL ?? 'gpt-5.4-nano'

  const { output } = await generateText({
    model: openai(modelId),
    system: REVIEW_SYSTEM_PROMPT,
    output: Output.object({ schema: ReviewSchema }),
    prompt: `Review this git diff:\n\n${diff}`,
    abortSignal: AbortSignal.timeout(60_000),
  })

  console.log(JSON.stringify(output, null, 2))
}

main().catch((err) => {
  console.error('review failed:', err)
  process.exit(1)
})
