# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: office-books-lesson.spec.ts >> Office books a lesson >> golden path: book a lesson then cancel via popover
- Location: e2e/office-books-lesson.spec.ts:17:7

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('option', { name: 'B' }) resolved to 2 elements:
    1) <div role="option" tabindex="-1" aria-selected="false" data-slot="select-item" class="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:…>…</div> aka getByRole('option', { name: 'B', exact: true })
    2) <div role="option" tabindex="-1" aria-selected="false" data-slot="select-item" class="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:…>…</div> aka getByRole('option', { name: 'B+E' })

Call log:
  - waiting for getByRole('option', { name: 'B' })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e5]:
      - generic [ref=e7]: DrivePlan
      - generic [ref=e8]:
        - generic [ref=e9]:
          - generic [ref=e10]: Category
          - combobox "Category" [expanded] [ref=e11]:
            - generic [ref=e12]: All categories
            - img: ▼
          - listbox [ref=e16]:
            - option "All categories" [active] [selected] [ref=e17]:
              - generic [ref=e18]: All categories
              - generic:
                - img
            - option "B" [ref=e19]:
              - generic [ref=e20]: B
            - option "B+E" [ref=e21]:
              - generic [ref=e22]: B+E
            - option "C" [ref=e23]:
              - generic [ref=e24]: C
            - option "C+E" [ref=e25]:
              - generic [ref=e26]: C+E
            - option "D" [ref=e27]:
              - generic [ref=e28]: D
            - option "T" [ref=e29]:
              - generic [ref=e30]: T
          - textbox [ref=e33]
        - separator [ref=e34]
        - list [ref=e36]:
          - listitem [ref=e37]:
            - button "Anna Nowak" [ref=e38]:
              - img [ref=e39]
              - generic [ref=e42]: Anna Nowak
          - listitem [ref=e43]:
            - button "Jan Kowalski" [ref=e44]:
              - img [ref=e45]
              - generic [ref=e48]: Jan Kowalski
          - listitem [ref=e49]:
            - button "Maria Dąbrowska" [ref=e50]:
              - img [ref=e51]
              - generic [ref=e54]: Maria Dąbrowska
          - listitem [ref=e55]:
            - button "Piotr Wiśniewski" [ref=e56]:
              - img [ref=e57]
              - generic [ref=e60]: Piotr Wiśniewski
          - listitem [ref=e61]:
            - button "test-instr-cat-1783161649785" [ref=e62]:
              - img [ref=e63]
              - generic [ref=e66]: test-instr-cat-1783161649785
          - listitem [ref=e67]:
            - button "test-instr-lessons-1783250616993" [ref=e68]:
              - img [ref=e69]
              - generic [ref=e72]: test-instr-lessons-1783250616993
          - listitem [ref=e73]:
            - button "test-instr-no-email-1783250625597" [ref=e74]:
              - img [ref=e75]
              - generic [ref=e78]: test-instr-no-email-1783250625597
          - listitem [ref=e79]:
            - button "test-office-poll-1783760866133" [ref=e80]:
              - img [ref=e81]
              - generic [ref=e84]: test-office-poll-1783760866133
          - listitem [ref=e85]:
            - button "test-office-poll-1783760940874" [ref=e86]:
              - img [ref=e87]
              - generic [ref=e90]: test-office-poll-1783760940874
          - listitem [ref=e91]:
            - button "test-office-poll-1783761019461" [ref=e92]:
              - img [ref=e93]
              - generic [ref=e96]: test-office-poll-1783761019461
          - listitem [ref=e97]:
            - button "test-office-poll-1783761322664" [ref=e98]:
              - img [ref=e99]
              - generic [ref=e102]: test-office-poll-1783761322664
          - listitem [ref=e103]:
            - button "test-office-poll-1783761426897" [ref=e104]:
              - img [ref=e105]
              - generic [ref=e108]: test-office-poll-1783761426897
          - listitem [ref=e109]:
            - button "test-office-poll-1783763671508" [ref=e110]:
              - img [ref=e111]
              - generic [ref=e114]: test-office-poll-1783763671508
          - listitem [ref=e115]:
            - button "Tomasz Zając" [ref=e116]:
              - img [ref=e117]
              - generic [ref=e120]: Tomasz Zając
      - generic [ref=e122]:
        - button "Toggle theme" [ref=e123]:
          - img
        - button "Log out" [ref=e125]
    - main [ref=e126]:
      - generic [ref=e127]:
        - button "Toggle Sidebar" [ref=e128]:
          - img
          - generic [ref=e129]: Toggle Sidebar
        - heading "Office Dashboard" [level=1] [ref=e130]
      - generic [ref=e132]: Select an instructor to view their schedule
  - alert [ref=e133]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('Office books a lesson', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     const email = process.env.OFFICE_EMAIL
  6  |     const password = process.env.OFFICE_PASSWORD
  7  |     if (!email || !password) {
  8  |       throw new Error('OFFICE_EMAIL and OFFICE_PASSWORD must be set in .env.test')
  9  |     }
  10 |     await page.goto('/login')
  11 |     await page.getByRole('textbox', { name: 'Email' }).fill(email)
  12 |     await page.getByRole('textbox', { name: 'Password' }).fill(password)
  13 |     await page.getByRole('button', { name: 'Log in' }).click()
  14 |     await page.waitForURL('/office')
  15 |   })
  16 | 
  17 |   test('golden path: book a lesson then cancel via popover', async ({ page }) => {
  18 |     // Far-future week — guaranteed to have no existing lessons
  19 |     await page.goto('/office?week=2099-01-06')
  20 | 
  21 |     // Filter sidebar to category B (shadcn Select — click trigger then pick option)
  22 |     await page.getByLabel('Category').click()
> 23 |     await page.getByRole('option', { name: 'B' }).click()
     |                                                   ^ Error: locator.click: Error: strict mode violation: getByRole('option', { name: 'B' }) resolved to 2 elements:
  24 | 
  25 |     // Select an instructor
  26 |     await page.getByRole('button', { name: 'Jan Kowalski' }).click()
  27 |     await page.waitForURL(/instructor=/)
  28 | 
  29 |     // Click an empty slot (first column = Mon, 09:00)
  30 |     await page.getByLabel('Mon 09:00').click()
  31 | 
  32 |     // Creation panel opens — "Book lesson" button signals the form is rendered
  33 |     const createPanel = page.getByRole('dialog', { name: /new lesson/i })
  34 |     await expect(createPanel.getByRole('button', { name: 'Book lesson' })).toBeVisible()
  35 | 
  36 |     // Pre-filled slot time is shown in the panel ("at 09:00" to avoid matching the time-label column)
  37 |     await expect(createPanel.getByText(/at 09:00/)).toBeVisible()
  38 |     await createPanel.getByLabel('Category').selectOption('B')
  39 |     await createPanel.getByLabel('Student').selectOption('Adam Wójcik')
  40 | 
  41 |     // Submit
  42 |     await page.getByRole('button', { name: 'Book lesson' }).click()
  43 | 
  44 |     // Panel closes; yellow lesson block appears on the calendar
  45 |     await expect(page.getByRole('button', { name: 'Book lesson' })).not.toBeVisible()
  46 |     const lessonBlock = page.getByRole('button', { name: /Adam Wójcik/ })
  47 |     await expect(lessonBlock).toBeVisible()
  48 | 
  49 |     // Cleanup: open the detail popover and cancel
  50 |     await lessonBlock.click()
  51 |     await expect(page.getByRole('button', { name: 'Cancel lesson' })).toBeVisible()
  52 |     await page.getByRole('button', { name: 'Cancel lesson' }).click()
  53 |     await expect(lessonBlock).not.toBeVisible()
  54 |   })
  55 | })
  56 | 
```