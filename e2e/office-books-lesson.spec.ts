import { test, expect, type Page } from '@playwright/test'
import { openListbox, waitForDrawerReady } from './utils'

// Teardown-before-setup: if a previous run of this test crashed after booking but
// before its own cleanup ran, a pending "Adam Wójcik" lesson is left behind. That
// leftover doesn't collide with this test's own booking at the DB level (the slot
// exclusion constraint only blocks the exact same instructor+time), but it does
// make the student-name locator below ambiguous. Clear any leftover first so every
// run starts from a guaranteed-clean slate regardless of how the previous one ended.
async function cancelAnyExistingLessons(page: Page, studentName: string) {
  const blocks = page.getByRole('button', { name: new RegExp(studentName) })
  for (let guard = 0; guard < 10; guard++) {
    const countBefore = await blocks.count()
    if (countBefore === 0) break
    await blocks.first().click()
    await expect(page.getByRole('button', { name: 'Cancel lesson' })).toBeVisible()
    await waitForDrawerReady(page)
    await page.getByRole('button', { name: 'Cancel lesson' }).click()
    await expect(page.getByRole('alertdialog', { name: /cancel this lesson/i })).toBeVisible()
    await page.getByRole('button', { name: 'Yes, cancel lesson' }).click()
    // Wait for this block's own detail popover to fully close before touching the
    // next block — clicking a new block while the previous popover is still
    // dismissing can be swallowed as an "outside click" on the old one instead of
    // opening the new one.
    await expect(page.getByRole('button', { name: 'Cancel lesson' })).not.toBeVisible()
    // The office view drops the cancelled lesson via revalidation, not instantly —
    // wait for the count to actually shrink before re-querying, rather than racing it.
    await expect(blocks).toHaveCount(countBefore - 1)
  }
}

test.describe('Office books a lesson', () => {
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

  test('golden path: book a lesson then cancel via popover', async ({ page }) => {
    // Far-future week — guaranteed to have no existing lessons
    await page.goto('/office?week=2099-01-06')

    // Filter sidebar to category B (shadcn Select — click trigger then pick option)
    // exact: true avoids an ambiguous match against the "B+E" category also seeded in this DB.
    await openListbox(page, page.getByLabel('Category'))
    await page.getByRole('option', { name: 'B', exact: true }).click()

    // Select an instructor
    await page.getByRole('button', { name: 'Jan Kowalski' }).click()
    await page.waitForURL(/instructor=/)

    // Clear any lesson left behind by a previous crashed run before we rely on
    // the target slot being clickable and the locator below being unambiguous.
    await cancelAnyExistingLessons(page, 'Adam Wójcik')

    // Click an empty slot (first column = Mon, 09:00)
    await page.getByLabel('Mon 09:00').click()

    // Creation panel opens — "Book lesson" button signals the form is rendered
    const createPanel = page.getByRole('dialog', { name: /new lesson/i })
    await expect(createPanel.getByRole('button', { name: 'Book lesson' })).toBeVisible()
    await waitForDrawerReady(page)

    // Pre-filled slot time is shown in the panel ("at 09:00" to avoid matching the time-label column)
    await expect(createPanel.getByText(/at 09:00/)).toBeVisible()
    // Select popups are portaled outside createPanel's DOM subtree, so options are
    // queried on `page`, not scoped to createPanel — same pattern as the sidebar
    // filter above. The explicit listbox wait absorbs the popup's open animation
    // before the option click, matching the same synchronization used for the
    // alert dialog below.
    await openListbox(page, createPanel.getByLabel('Category'))
    await page.getByRole('option', { name: 'B', exact: true }).click()
    await openListbox(page, createPanel.getByLabel('Student'))
    await page.getByRole('option', { name: 'Adam Wójcik' }).click()

    // Submit
    await page.getByRole('button', { name: 'Book lesson' }).click()

    // Panel closes; yellow lesson block appears on the calendar.
    // Scoped by both student name and slot time (LessonBlock's aria-label carries
    // the full scheduled date/time) — a name-only match would also hit any other
    // pending lesson for the same student at a different time in this view.
    await expect(page.getByRole('button', { name: 'Book lesson' })).not.toBeVisible()
    const lessonBlock = page.getByRole('button', { name: /Adam Wójcik.*09:00$/ })
    await expect(lessonBlock).toBeVisible()

    // Cleanup: open the detail popover, confirm the cancel alert dialog
    await lessonBlock.click()
    await expect(page.getByRole('button', { name: 'Cancel lesson' })).toBeVisible()
    await waitForDrawerReady(page)
    await page.getByRole('button', { name: 'Cancel lesson' }).click()
    await expect(page.getByRole('alertdialog', { name: /cancel this lesson/i })).toBeVisible()
    await page.getByRole('button', { name: 'Yes, cancel lesson' }).click()
    await expect(lessonBlock).not.toBeVisible()
  })
})
