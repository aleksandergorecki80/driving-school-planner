import { test, expect } from "@playwright/test";

test("authenticated office user is redirected to /office after login", async ({
  page,
}) => {
  await page.goto("/login");

  await page
    .getByRole("textbox", { name: "Email" })
    .fill(process.env.OFFICE_EMAIL!);
  await page
    .getByRole("textbox", { name: "Password" })
    .fill(process.env.OFFICE_PASSWORD!);
  await page.getByRole("button", { name: "Log in" }).click();

  await page.waitForURL("/office");
  await expect(page.getByRole("heading", { name: /office/i })).toBeVisible();
});
