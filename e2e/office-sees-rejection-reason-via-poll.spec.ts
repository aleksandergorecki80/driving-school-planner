import { test, expect } from '@playwright/test'
import { createTestServiceRoleClient } from '../src/lib/supabase/test-client'
import { openListbox, waitForDrawerReady } from './utils'

// Protects test-plan.md Risk #5: "Rejection reason silently not persisted or not
// displayed to office; office must call the instructor for context anyway."
// Persistence is already proven at the integration level (src/domain/lesson/Lesson.test.ts
// / src/app/actions/lessons.test.ts) and visibility was fixed in the
// office-rejection-reason-display change (LessonRow, office/page.tsx, LessonPopover.tsx).
// What only a real browser can prove is the actual PRD acceptance criterion: after an
// instructor rejects with a reason in a fully separate session, the office — without
// manually reloading — sees the lesson turn Rejected and can read that exact reason in
// the lesson's detail panel.

const WEEK = '2099-03-03' // far-future, distinct from the other e2e specs' weeks
const STUDENT_NAME = 'Michał Kowalczyk' // distinct student from the other e2e specs
const INSTRUCTOR_NAME = 'Jan Kowalski'
const REJECTION_REASON = 'Car unavailable for this slot — needs rescheduling'

// Mirrors src/app/office/page.tsx's snapToMonday (UTC) so we can compute the exact
// scheduled_at the office UI will write for "Wed 11:00" of this week, purely to read
// back the lesson's one-time token and to clean up — never to bypass the real write path.
function mondayOf(weekParam: string): Date {
  const d = new Date(`${weekParam}T00:00:00.000Z`)
  const dayOfWeek = d.getUTCDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysFromMonday))
}

// Wed 11:00 — a different day+time than the other e2e specs, so no two specs ever
// touch the same row even if run concurrently.
const SCHEDULED_AT = new Date(mondayOf(WEEK).getTime() + (48 + 11) * 60 * 60 * 1000).toISOString()

test.describe('Office sees rejection reason via poll', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.OFFICE_EMAIL
    const password = process.env.OFFICE_PASSWORD
    if (!email || !password) {
      throw new Error('OFFICE_EMAIL and OFFICE_PASSWORD must be set in .env.test')
    }
    await page.goto('/login')
    await page.getByRole('textbox', { name: 'Email' }).fill(email)
    await page.getByRole('textbox', { name: 'Password' }).fill(password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL('/office')
  })

  test('lesson rejected with a reason by the instructor shows that reason on the office side after the next poll', async ({
    page,
    browser,
  }) => {
    // The final assertion waits out a real 30s poll interval — give the whole test room.
    test.setTimeout(70_000)

    const db = createTestServiceRoleClient()

    // Teardown-before-setup: clear any lesson a previous crashed run left at this exact
    // slot, so this run always starts from a guaranteed-clean, unambiguous slate.
    await db.from('lessons').delete().eq('scheduled_at', SCHEDULED_AT)

    await page.goto(`/office?week=${WEEK}`)
    await page.getByRole('button', { name: INSTRUCTOR_NAME }).click()
    await page.waitForURL(/instructor=/)

    // Book the lesson via the real office flow (same path as office-books-lesson.spec.ts)
    await page.getByLabel('Wed 11:00').click()
    const createPanel = page.getByRole('dialog', { name: /new lesson/i })
    await expect(createPanel.getByRole('button', { name: 'Book lesson' })).toBeVisible()
    await waitForDrawerReady(page)
    await openListbox(page, createPanel.getByLabel('Category'))
    await page.getByRole('option', { name: 'B', exact: true }).click()
    await openListbox(page, createPanel.getByLabel('Student'))
    await page.getByRole('option', { name: STUDENT_NAME }).click()
    await page.getByRole('button', { name: 'Book lesson' }).click()
    await expect(page.getByRole('button', { name: 'Book lesson' })).not.toBeVisible()

    const pendingBlock = page.getByRole('button', { name: new RegExp(`${STUDENT_NAME}.*Pending`) })
    await expect(pendingBlock).toBeVisible()

    try {
      // Read the one-time lesson token directly from the DB rather than via the real
      // outbound email (Resend) — email delivery is an external, non-deterministic
      // boundary; the token itself is the real artifact, so reading it doesn't bypass
      // any app logic, only the delivery channel.
      const { data: lesson, error } = await db
        .from('lessons')
        .select('token')
        .eq('scheduled_at', SCHEDULED_AT)
        .single()
      if (error || !lesson) {
        throw new Error(`could not read back the booked lesson's token: ${error?.message}`)
      }

      // The instructor rejects, with a reason, in a fully separate browser session — no
      // shared cookies/state with the office session, matching the real one-time-token,
      // no-login instructor flow.
      const instructorContext = await browser.newContext()
      const instructorPage = await instructorContext.newPage()
      await instructorPage.goto(`/lesson/${lesson.token}`)
      await instructorPage.getByRole('button', { name: 'Reject' }).click()
      await instructorPage.getByLabel('Reason (optional)').fill(REJECTION_REASON)
      await instructorPage.getByRole('button', { name: 'Yes, reject' }).click()
      await expect(instructorPage.getByText(/response has been recorded/i)).toBeVisible()
      await instructorContext.close()

      // Back on the still-open office page: no reload/navigation is triggered here —
      // only AutoRefresh's own timer may update the DOM. The generous timeout absorbs
      // the real 30s poll interval itself (not an arbitrary guess); toBeVisible auto-
      // retries until the condition holds, per project E2E rules (no waitForTimeout).
      const rejectedBlock = page.getByRole('button', {
        name: new RegExp(`${STUDENT_NAME}.*Rejected`),
      })
      await expect(rejectedBlock).toBeVisible({ timeout: 40_000 })

      // Open the lesson's detail panel and confirm the actual reason text is shown —
      // the PRD acceptance criterion this risk protects, not just the status badge.
      await rejectedBlock.click()
      const detailPanel = page.getByRole('dialog', { name: 'Lesson details' })
      await expect(detailPanel.getByText(REJECTION_REASON)).toBeVisible()
    } finally {
      await db.from('lessons').delete().eq('scheduled_at', SCHEDULED_AT)
    }
  })
})
