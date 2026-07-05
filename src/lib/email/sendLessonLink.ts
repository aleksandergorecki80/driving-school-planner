import { Resend } from 'resend'

export async function sendLessonLink(
  to: string,
  lessonLinkUrl: string,
): Promise<{ error?: string }> {
  try {
    const apiKey = process.env.RESEND_API_KEY
    const emailFrom = process.env.EMAIL_FROM

    if (!apiKey || !emailFrom) {
      return { error: 'Missing RESEND_API_KEY or EMAIL_FROM — check .env.local' }
    }

    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: emailFrom,
      to,
      subject: 'A lesson needs your response',
      html: `<p>A lesson needs your response. Open the link below to approve or reject it:</p><p><a href="${lessonLinkUrl}">${lessonLinkUrl}</a></p>`,
    })

    if (error) {
      return { error: error.message }
    }

    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to send email' }
  }
}
