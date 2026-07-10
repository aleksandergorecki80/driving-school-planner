'use server'
import { suggestRejectionReasons } from '@/lib/ai/suggestRejectionReasons'

const MAX_CATEGORY_LENGTH = 20

export async function suggestRejectionReasonsAction(input: {
  scheduledAt: string
  category: string
}): Promise<string[]> {
  if (Number.isNaN(new Date(input.scheduledAt).getTime())) {
    return []
  }
  if (!input.category || input.category.length > MAX_CATEGORY_LENGTH) {
    return []
  }

  return suggestRejectionReasons(input)
}
