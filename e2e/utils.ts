import { expect, type Locator, type Page } from '@playwright/test'

// The lesson panel (vaul Drawer, `[data-vaul-drawer]`) registers itself with Radix's
// dismissable-layer machinery asynchronously as it opens. A click landing inside that
// short window — trivially achievable by Playwright, essentially never by a real user's
// reaction time — can be misclassified as "outside" and dismiss the whole drawer instead
// of reaching the clicked control (confirmed via trace: the dialog's aria-label flips
// from "New lesson"/"Lesson details" content to an empty "Lesson details" shell, i.e.
// LessonPanel's `mode` reset to idle). Waiting for the drawer's own real opening
// animation to finish — a genuine state signal, not a guessed delay — avoids racing that
// registration. The timeout fallback only covers environments where no animation runs at
// all (e.g. reduced motion), not a substitute for the event.
export async function waitForDrawerReady(page: Page) {
  await page.locator('[data-vaul-drawer]').evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const done = () => resolve()
        el.addEventListener('animationend', done, { once: true })
        el.addEventListener('transitionend', done, { once: true })
        setTimeout(done, 400)
      }),
  )
}

// The panel's Select/Combobox trigger is genuinely `disabled` (see NewLessonForm.tsx's
// `rootEl` comment) until its popup's portal container is ready, so Playwright's own
// actionability check already waits out that window before clicking — a plain click
// should be enough. This keeps one retry as a defensive margin (Playwright's documented
// "wait for state" pattern via expect(...).toPass, not a fixed sleep) rather than trusting
// a single attempt against a real animated popup.
export async function openListbox(page: Page, trigger: Locator) {
  await expect(async () => {
    await trigger.click()
    await expect(page.getByRole('listbox')).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 5_000 })
}
