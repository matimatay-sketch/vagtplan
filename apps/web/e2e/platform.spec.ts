import { expect, test } from "@playwright/test";
import { latestLinkFor, login, users } from "./helpers";

test("self-service sign-up is gone", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Opret virksomhed" })).toHaveCount(0);
  await page.goto("/opret");
  await expect(page).toHaveURL(/\/login/);
  await login(page, users.admin);
  const res = await page.goto("/opret");
  expect(res?.status()).toBe(404);
});

test("customer administrators cannot open the platform", async ({ page }) => {
  await login(page, users.admin);
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/oversigt/);
});

test("platform creates a customer, invites its administrator and can archive it", async ({
  page,
  browser,
}) => {
  const tag = Date.now().toString(36);
  const name = `Kunde ${tag} ApS`;
  const email = `konsulent-${tag}@test.dk`;

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(users.platform);
  await page.getByLabel("Adgangskode").fill("Demo1234!");
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await expect(page).toHaveURL(/\/platform/);
  await expect(page.getByRole("heading", { name: "Kundeoversigt" })).toBeVisible();

  const form = page.getByTestId("customer-form");
  await form.getByLabel("Virksomhedens navn").fill(name);
  await form.getByLabel("Administrators e-mail").fill(email);
  await form.getByRole("button", { name: "Opret kunde" }).click();
  await expect(
    form.getByText("Kunden er oprettet, og administratoren er inviteret."),
  ).toBeVisible();
  const row = page.locator(`tr[data-customer="${name}"]`);
  await expect(row).toContainText(email);

  // The configurer signs in via the invitation and administers only the new customer.
  const link = await latestLinkFor(email);
  const ctx = await browser.newContext({ locale: "da-DK" });
  const configurer = await ctx.newPage();
  await configurer.goto(link);
  await expect(configurer).toHaveURL(/\/oversigt/);
  await expect(configurer.getByTestId("org-name").first()).toHaveText(name);
  await expect(configurer.getByText("Administrator").first()).toBeVisible();
  await configurer.goto("/medarbejdere");
  await expect(configurer.getByText("Ingen medarbejdere endnu.")).toBeVisible();

  // Archiving cuts access; reopening restores it.
  await row.getByRole("button", { name: `Arkivér ${name}` }).click();
  await expect(row).toContainText("Arkiveret");
  await configurer.goto("/oversigt");
  await expect(configurer).toHaveURL(/\/ingen-adgang/);
  await expect(
    configurer.getByRole("heading", { name: "Du er ikke tilknyttet en virksomhed" }),
  ).toBeVisible();
  await row.getByRole("button", { name: `Genåbn ${name}` }).click();
  await expect(row).not.toContainText("Arkiveret");
  await configurer.goto("/oversigt");
  await expect(configurer).toHaveURL(/\/oversigt/);
  await ctx.close();
});
