import { test, expect } from '@playwright/test'

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

    // Filter sidebar to category B
    await page.getByLabel('Category').selectOption('B')

    // Select an instructor
    await page.getByRole('button', { name: 'Jan Kowalski' }).click()
    await page.waitForURL(/instructor=/)

    // Click an empty slot (first column = Mon, 09:00)
    await page.getByLabel('Mon 09:00').click()

    // Creation panel opens — "Book lesson" button signals the form is rendered
    const createPanel = page.getByRole('dialog', { name: /new lesson/i })
    await expect(createPanel.getByRole('button', { name: 'Book lesson' })).toBeVisible()

    // Pre-filled slot time is shown in the panel ("at 09:00" to avoid matching the time-label column)
    await expect(createPanel.getByText(/at 09:00/)).toBeVisible()
    await createPanel.getByLabel('Category').selectOption('B')
    await createPanel.getByLabel('Student').selectOption('Adam Wójcik')

    // Submit
    await page.getByRole('button', { name: 'Book lesson' }).click()

    // Panel closes; yellow lesson block appears on the calendar
    await expect(page.getByRole('button', { name: 'Book lesson' })).not.toBeVisible()
    const lessonBlock = page.getByRole('button', { name: /Adam Wójcik/ })
    await expect(lessonBlock).toBeVisible()

    // Cleanup: open the detail popover and cancel
    await lessonBlock.click()
    await expect(page.getByRole('button', { name: 'Cancel lesson' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel lesson' }).click()
    await expect(lessonBlock).not.toBeVisible()
  })
})
