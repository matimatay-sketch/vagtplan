import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

const local = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
/** The 14-day pay period (anchored on 5 January 2026) that contains `date`. */
function biweeklyStart(date: string): string {
  const anchor = Date.UTC(2026, 0, 5);
  const t = Date.parse(`${date}T00:00:00Z`);
  const n = Math.floor((t - anchor) / (14 * 86_400_000));
  return new Date(anchor + n * 14 * 86_400_000).toISOString().slice(0, 10);
}

test("approved time is calculated with explanations, the period is closed and exported", async ({
  page,
}) => {
  const day = local(new Date(Date.now() - 2 * 86_400_000));

  // Mads registers four hours, and the manager approves them.
  await login(page, users.employee);
  await page.goto("/tid");
  await page.getByRole("button", { name: "Registrér tid" }).click();
  const form = page.getByTestId("entry-form");
  await form.getByLabel("Dato").fill(day);
  await form.getByLabel("Start").fill("07:00");
  await form.getByLabel("Slut").fill("11:00");
  await form.getByTestId("break-row").getByRole("button", { name: "Fjern pause" }).click();
  await form.getByLabel("Begrundelse for afvigelse").fill("Varemodtagelse");
  await form.getByRole("button", { name: "Gem registrering" }).click();
  await expect(form).toHaveCount(0);
  await page.context().clearCookies();

  await login(page, users.manager);
  await page.goto(`/tid/godkend?uge=${day}`);
  const row = page
    .locator('section[data-employee="Mads Medarbejder"]')
    .getByTestId("approval-row")
    .filter({ hasText: "07:00–11:00" });
  await row.getByRole("checkbox").check();
  await page.getByTestId("approve-selected").click();
  await expect(row).toContainText("Godkendt");
  await page.context().clearCookies();

  // The admin builds an export template.
  await login(page, users.admin);
  await page.goto("/lon/skabeloner?skabelon=ny");
  const editor = page.getByTestId("template-editor");
  await editor.getByLabel("Navn").fill(`Lønsystem ${Date.now().toString(36)}`);
  await expect(page.getByTestId("template-preview")).toContainText("Medarbejdernr.;Navn;Lønart");
  await editor.getByRole("button", { name: "Gem skabelon" }).click();
  await expect(page.getByText("Skabelonen er gemt.")).toBeVisible();

  // Calculate, explain, close and export the period.
  await page.goto("/lon");
  await page
    .locator(`tr[data-period="Timelønnede (14 dage)|${biweeklyStart(day)}"]`)
    .getByRole("link", { name: "Åbn" })
    .click();
  await page.getByRole("button", { name: "Beregn alle" }).click();
  await expect(page.getByText(/medarbejdere? beregnet/)).toBeVisible();
  const mads = page.locator('section[data-employee="Mads Medarbejder"]');
  const normal = mads.locator('tr[data-pay-code="NORMAL"]');
  await expect(normal).toContainText("4,00 t");
  await expect(normal).toContainText("600,00");
  await normal.getByText("Hvorfor?").click();
  await expect(normal).toContainText("loensats");
  await expect(normal).toContainText("Eksempel § 1");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Afslut periode" }).click();
  await expect(page.getByTestId("period-status")).toHaveText("Afsluttet");
  await expect(page.getByRole("button", { name: "Beregn alle" })).toHaveCount(0);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Eksportér" }).click(),
  ]);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.startsWith("﻿Medarbejdernr.;Navn;Lønart;Tekst;Timer;Sats;Beløb;Fra;Til\r\n")).toBe(
    true,
  );
  expect(csv).toContain("1002;Mads Medarbejder;NORMAL;Timeløn;4,00;150,00;600,00;");
});
