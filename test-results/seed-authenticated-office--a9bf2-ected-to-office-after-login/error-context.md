# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: seed.spec.ts >> authenticated office user is redirected to /office after login
- Location: e2e/seed.spec.ts:3:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /office/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: /office/i })

```

```yaml
- alert
- banner:
  - text: DrivePlan
  - button "Log out"
- main:
  - complementary:
    - text: Category
    - combobox "Category": All categories
    - list:
      - listitem:
        - button "Anna Nowak"
      - listitem:
        - button "Jan Kowalski"
      - listitem:
        - button "Maria Dąbrowska"
      - listitem:
        - button "Piotr Wiśniewski"
      - listitem:
        - button "test-instr-cat-1783161649785"
      - listitem:
        - button "Tomasz Zając"
  - text: Select an instructor to view their schedule
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test("authenticated office user is redirected to /office after login", async ({
  4  |   page,
  5  | }) => {
  6  |   await page.goto("/login");
  7  | 
  8  |   await page
  9  |     .getByRole("textbox", { name: "Email" })
  10 |     .fill(process.env.OFFICE_EMAIL!);
  11 |   await page
  12 |     .getByRole("textbox", { name: "Password" })
  13 |     .fill(process.env.OFFICE_PASSWORD!);
  14 |   await page.getByRole("button", { name: "Log in" }).click();
  15 | 
  16 |   await page.waitForURL("/office");
> 17 |   await expect(page.getByRole("heading", { name: /office/i })).toBeVisible();
     |                                                                ^ Error: expect(locator).toBeVisible() failed
  18 | });
  19 | 
```