import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

const MADS = "/medarbejdere/50000000-0000-0000-0000-000000000002";

test("the primary department can be chosen again", async ({ page }) => {
  await login(page, users.admin);
  await page.goto(MADS);
  await page.getByRole("button", { name: "Gør til primær afdeling: Café" }).click();
  await expect(page.getByRole("button", { name: "Gør til primær afdeling: Butik" })).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Café" }).getByLabel("Primær"),
  ).toBeVisible();
  // Back to Butik for the other tests.
  await page.getByRole("button", { name: "Gør til primær afdeling: Butik" }).click();
  await expect(page.getByRole("button", { name: "Gør til primær afdeling: Café" })).toBeVisible();
});

test("pay period groups can be renamed and deleted", async ({ page }) => {
  const name = `Ugeløn ${Date.now().toString(36)}`;
  await login(page, users.admin);
  await page.goto("/indstillinger/lonperioder");
  await page.getByLabel("Navn").first().fill(name);
  await page.getByLabel("Frekvens").first().selectOption("weekly");
  await page.getByRole("button", { name: "Opret" }).click();
  const card = page.locator('[data-slot="card"]').filter({ hasText: name });
  await expect(card).toBeVisible();

  await card.getByText("Ret eller slet").click();
  const form = card.getByTestId("edit-pay-period-group");
  await form.getByLabel("Navn").fill(`${name} (ny)`);
  await form.getByLabel("Frekvens").selectOption("monthly");
  await form.getByRole("button", { name: "Gem gruppe" }).click();
  const renamed = page.locator('[data-slot="card"]').filter({ hasText: `${name} (ny)` });
  await expect(renamed).toContainText("Måned");

  // The fold stays open after saving.
  page.once("dialog", (d) => d.accept());
  await renamed.getByRole("button", { name: "Slet gruppe" }).click();
  await expect(page.locator('[data-slot="card"]').filter({ hasText: `${name} (ny)` })).toHaveCount(
    0,
  );

  // A group with active contracts is refused with a clear reason.
  const used = page.locator('[data-slot="card"]').filter({ hasText: "Timelønnede (14 dage)" });
  page.once("dialog", (d) => d.accept());
  await used.getByText("Ret eller slet").click();
  await used.getByRole("button", { name: "Slet gruppe" }).click();
  await expect(used.getByText("Aktive kontrakter bruger gruppen.")).toBeVisible();
});

test("an employee with an active contract is not deleted; templates can be edited", async ({
  page,
}) => {
  await login(page, users.admin);
  await page.goto(MADS);
  page.once("dialog", (d) => d.accept());
  await page
    .getByTestId("delete-employee")
    .getByRole("button", { name: "Slet medarbejder" })
    .click();
  await expect(page.getByText("Afslut medarbejderens kontrakt først.")).toBeVisible();

  const tpl = `Aften ${Date.now().toString(36)}`;
  await page.goto("/vagtplan/skabeloner");
  await page.getByLabel("Navn").first().fill(tpl);
  await page.getByRole("button", { name: "Ny skabelon" }).click();
  await page.getByRole("button", { name: `Ret skabelon ${tpl}` }).click();
  const edit = page.getByTestId("edit-template-form");
  await edit.getByLabel("Start").fill("15:00");
  await edit.getByLabel("Slut").fill("22:00");
  await edit.getByRole("button", { name: "Gem skabelon" }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: tpl })).toContainText("15:00–22:00");
});
