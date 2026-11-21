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

test("a customer on Industriens Overenskomst gets a base set up for it", async ({
  page,
  browser,
}) => {
  const tag = Date.now().toString(36);
  const name = `Industri ${tag} A/S`;
  const email = `industri-${tag}@test.dk`;
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(users.platform);
  await page.getByLabel("Adgangskode").fill("Demo1234!");
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await expect(page).toHaveURL(/\/platform/);

  const form = page.getByTestId("customer-form");
  await form.getByLabel("Virksomhedens navn").fill(name);
  await form.getByLabel("Administrators e-mail").fill(email);
  await form.getByLabel("Startpakke").selectOption({ label: "Industriens Overenskomst" });
  await form.getByRole("button", { name: "Opret kunde" }).click();
  await expect(
    form.getByText("Kunden er oprettet, og administratoren er inviteret."),
  ).toBeVisible();

  const ctx = await browser.newContext({ locale: "da-DK" });
  const admin = await ctx.newPage();
  await admin.goto(await latestLinkFor(email));
  await expect(admin).toHaveURL(/\/oversigt/);

  // The agreement is the standard for new contracts, with its supplements and pay periods.
  await admin.goto("/indstillinger/opsaetning");
  await expect(
    admin.getByTestId("default-agreement-form").getByLabel("Overenskomst til nye kontrakter"),
  ).toHaveValue(/.+/);
  await expect(admin.getByTestId("default-agreement-form").locator("option:checked")).toHaveText(
    "Industriens Overenskomst 2025–2028",
  );
  await expect(admin.getByText("Udearbejde (§ 19 stk. 2)")).toBeVisible();
  await admin.goto("/indstillinger/lonperioder");
  await expect(admin.getByText("Timelønnede (14 dage)").first()).toBeVisible();

  // The agreement is the customer's own: it can get new versions and be deleted.
  await admin.goto("/indstillinger/overenskomster");
  await admin
    .getByRole("link", { name: /Industriens Overenskomst 2025–2028/ })
    .first()
    .click();
  await expect(admin.getByText("Egen").first()).toBeVisible();
  await expect(admin.getByTestId("agreement-versions").locator("tbody tr")).toHaveCount(3);
  await expect(admin.getByRole("button", { name: "Ny version" })).toBeVisible();
  admin.on("dialog", (d) => void d.accept());

  // A published version opens with all its rules and is changed directly (no closed pay period yet).
  await admin.getByRole("link", { name: "Åbn version 2" }).click();
  const version = admin.getByTestId("agreement-editor");
  const forskudt = version.locator('details[data-rule="forskudt-1"]');
  await forskudt.locator("> summary").click();
  await expect(forskudt.getByLabel("Kr. pr. time")).toHaveValue("32,60");
  await forskudt.getByLabel("Kr. pr. time").fill("33,00");
  await version.getByRole("button", { name: "Gem ændringer i versionen" }).click();
  await expect(admin.getByText("Versionen er rettet.")).toBeVisible();
  await admin.reload();
  await admin.locator('details[data-rule="forskudt-1"] > summary').click();
  await expect(
    admin.locator('details[data-rule="forskudt-1"]').getByLabel("Kr. pr. time"),
  ).toHaveValue("33,00");
  await admin.getByRole("link", { name: "Industriens Overenskomst 2025–2028" }).click();

  await admin.getByTestId("delete-agreement").click();
  await expect(admin).toHaveURL(/\/indstillinger\/overenskomster$/);
  await expect(admin.getByRole("link", { name: /Industriens Overenskomst 2025–2028/ })).toHaveCount(
    0,
  );
  await admin.goto("/indstillinger/opsaetning");
  await expect(
    admin.getByTestId("default-agreement-form").getByLabel("Overenskomst til nye kontrakter"),
  ).toHaveValue("");
  await ctx.close();
});

test("a platform administrator edits the Industriens Overenskomst starter kit", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(users.platform);
  await page.getByLabel("Adgangskode").fill("Demo1234!");
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await expect(page).toHaveURL(/\/platform/);
  await page.getByTestId("starter-kits").getByRole("link", { name: "Ret startpakke" }).click();
  await expect(page.getByTestId("kit-versions").locator("tbody tr")).toHaveCount(3);

  // A rule in a version: the evening rate from 1 March 2027.
  await page.getByRole("link", { name: "Åbn version 3" }).click();
  const editor = page.getByTestId("agreement-editor");
  const rule = editor.locator('details[data-rule="forskudt-1"]');
  const rate = rule.getByLabel("Kr. pr. time");
  const save = async (value: string) => {
    if (!(await rule.evaluate((d) => (d as HTMLDetailsElement).open)))
      await rule.locator("> summary").click();
    await rate.fill(value);
    await editor.getByRole("button", { name: "Gem i startpakken" }).click();
    await expect(page.getByText("Startpakken er gemt.").first()).toBeVisible();
  };
  await save("34,00");
  await page.reload();
  await rule.locator("> summary").click();
  await expect(rate).toHaveValue("34,00");
  await save("33,75"); // back to the agreement's rate

  // The supplement types that come with the kit, with a rate per date.
  // A fresh page load, so the earlier toast is gone.
  await page.goto("/platform/startpakker/industriens-overenskomst");
  const extras = page.getByTestId("kit-extras");
  const skift4 = extras
    .locator('tr[data-kit-supplement="SKIFT_4"] input[inputmode="decimal"]')
    .last();
  const saveRate = async (value: string) => {
    await skift4.fill(value);
    await extras.getByRole("button", { name: "Gem tillægstyper og lønperioder" }).click();
    await expect(
      extras.getByRole("button", { name: "Gem tillægstyper og lønperioder" }),
    ).toBeEnabled();
    await page.reload();
    await expect(skift4).toHaveValue(value);
  };
  const original = await skift4.inputValue();
  await saveRate("36,00");
  await saveRate(original === "36,00" ? "35,15" : original);
});
