import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

/** A date `n` days ago (Copenhagen) and the Monday of its week. */
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  const m = new Date(`${date}T12:00:00Z`);
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() || 7) - 1));
  return { date, monday: m.toISOString().slice(0, 10) };
}

test("an employee adds a supplement the consultant allowed; it is approved with the time", async ({
  page,
}) => {
  const { date, monday } = daysAgo(23);

  // The admin creates one supplement employees may choose and one they may not.
  await login(page, users.admin);
  await page.goto("/indstillinger/opsaetning");
  const st = page.getByTestId("supplement-type-form");
  await st.getByLabel("Navn").fill("Smudstillæg");
  await st.getByLabel("Lønart").fill("SMUDS");
  await st.getByLabel("Beregning").selectOption("fixed");
  await st.getByLabel("Beløb / procent").fill("40,00");
  await st.getByLabel("Medarbejdere kan selv tilføje").check();
  await st.getByRole("button", { name: "Opret tillæg" }).click();
  const list = page.getByTestId("supplement-types");
  await expect(list.locator("li").filter({ hasText: "Smudstillæg" })).toContainText(
    "Medarbejdere kan vælge",
  );
  await st.getByLabel("Navn").fill("Nøgleansvar");
  await st.getByLabel("Lønart").fill("NOEGLE");
  await st.getByLabel("Beløb / procent").fill("10,00");
  await st.getByRole("button", { name: "Opret tillæg" }).click();
  await expect(list.locator("li").filter({ hasText: "Nøgleansvar" })).toContainText("Kun leder");
  await page.context().clearCookies();

  // Mads registers time and adds the supplement; the other one is not offered.
  await login(page, users.employee);
  await page.goto("/tid");
  await page.getByRole("button", { name: "Registrér tid" }).click();
  const form = page.getByTestId("entry-form");
  await form.getByLabel("Dato").fill(date);
  await form.getByLabel("Start").fill("05:00");
  await form.getByLabel("Slut").fill("07:00");
  await form.getByTestId("break-row").getByRole("button", { name: "Fjern pause" }).click();
  await form.getByLabel("Begrundelse for afvigelse").fill("Rengøring af fryser");
  const supplements = form.getByTestId("entry-supplements");
  await expect(supplements).not.toContainText("Nøgleansvar");
  await supplements.getByLabel(/Smudstillæg/).check();
  await form.getByRole("button", { name: "Gem registrering" }).click();
  await expect(form).toHaveCount(0);
  await page.context().clearCookies();

  // The manager filters on registrations with the employee's own supplements.
  await login(page, users.manager);
  await page.goto(`/tid/godkend?uge=${monday}&vis=supplements`);
  const row = page
    .locator('section[data-employee="Mads Medarbejder"]')
    .getByTestId("approval-row")
    .filter({ hasText: "05:00–07:00" });
  await expect(row.getByTestId("row-supplements")).toHaveText("Tillæg: Smudstillæg");
  await expect(
    page.locator(
      '[data-testid="pay-preview"][data-employee="Mads Medarbejder"] tr[data-pay-code="SMUDS"]',
    ),
  ).toContainText("40,00");
  await row.getByRole("checkbox").check();
  await page.getByTestId("approve-selected").click();
  await expect(page.getByText("1 registrering godkendt.")).toBeVisible();
  await expect(row).toContainText("Godkendt");
  await expect(row.getByTestId("row-supplements")).toBeVisible();
});
