'use server'
import { suggestRejectionReasons } from '@/lib/ai/suggestRejectionReasons'

export async function suggestRejectionReasonsAction(input: {
  scheduledAt: string
  category: string
}): Promise<string[]> {
  return suggestRejectionReasons(input)
}
