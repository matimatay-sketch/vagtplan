import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

const MADS_ID = "50000000-0000-0000-0000-000000000002";
const GROUP = "E2E Chauffører";
const REASON = "E2E Kørsel";

test("employee groups, and a deviation reason and a supplement that apply to some only", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  await login(page, users.admin);
  await page.goto("/indstillinger/opsaetning");

  // A group, used on an employee.
  const groups = page.getByTestId("employee-groups-card");
  await groups.getByLabel("Ny gruppe").fill(GROUP);
  await groups.getByRole("button", { name: "Opret gruppe" }).click();
  await expect(groups.locator(`li[data-group="${GROUP}"]`)).toBeVisible();

  await page.goto(`/medarbejdere/${MADS_ID}`);
  await page.getByLabel("Medarbejdergruppe").selectOption({ label: GROUP });
  await page.getByRole("button", { name: "Gem stamdata" }).click();
  await expect(page.getByText("Gemt").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Medarbejdergruppe")).toHaveValue(/.+/);

  // A reason only for the group.
  await page.goto("/indstillinger/opsaetning");
  const card = page.getByTestId("deviation-reasons");
  const form = card.getByTestId("deviation-reason-form").last();
  await form.getByLabel("Navn").fill(REASON);
  await form.getByLabel("Betydning for lønnen").selectOption({ index: 1 });
  await form.getByLabel("stempler uden vagt").check();
  await form.getByText("Gælder for").click();
  await form.getByTestId("scope-fields").getByLabel(GROUP).check();
  await form.getByRole("button", { name: "Opret årsag" }).click();
  const reason = card.locator(`li[data-reason="${REASON}"]`);
  await expect(reason.getByTestId("scope-text")).toHaveText(`Gælder for: ${GROUP}`);

  // A supplement only for Café.
  const supplement = page.getByTestId("supplement-type-form");
  const name = `E2E Cafétillæg ${Date.now().toString(36)}`;
  await supplement.getByLabel("Navn").fill(name);
  await supplement.getByLabel("Lønart").fill(`E2E${Date.now().toString(36).toUpperCase()}`);
  await supplement.getByLabel("Beløb / procent").fill("10,00");
  await supplement.getByText("Gælder for").click();
  await supplement.getByTestId("scope-fields").getByLabel("Café").check();
  await supplement.getByRole("button", { name: "Opret tillæg" }).click();
  await expect(
    page.getByTestId("supplement-types").locator("li", { hasText: name }).getByTestId("scope-text"),
  ).toHaveText("Gælder for: Café");

  // Clean up: the reason and the group (the supplement is harmless elsewhere).
  await reason.getByRole("button", { name: `Slet ${REASON}` }).click();
  await expect(reason).toHaveCount(0);
  await groups
    .locator(`li[data-group="${GROUP}"]`)
    .getByRole("button", { name: `Slet ${GROUP}` })
    .click();
  await expect(groups.locator(`li[data-group="${GROUP}"]`)).toHaveCount(0);
});
