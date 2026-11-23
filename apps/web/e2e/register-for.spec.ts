import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

/** Monday of the week `weeks` from now, by the Copenhagen date. */
function mondayIn(weeks: number): string {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * weeks);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}
const plus = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const cell = (page: Page, row: string, date: string) =>
  page.locator(`tr[data-row="${row}"] td[data-cell$="|${date}"]`);
const IDA = "Ida Ung";

test("a manager registers time for employees: a planned shift with other times, and without a plan", async ({
  page,
}) => {
  const week = mondayIn(-3);
  const tuesday = plus(week, 1);
  const thursday = plus(week, 3);

  // Lise plans and publishes Tuesday 09:00–15:00 for Ida.
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  const c = cell(page, IDA, tuesday);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const shift = page.getByTestId("shift-form");
  await shift.getByLabel("Start").fill("09:00");
  await shift.getByLabel("Slut").fill("15:00");
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  await expect(shift).toHaveCount(0);
  await page.getByTestId("publish-button").click();
  const publish = page.getByTestId("publish-dialog");
  for (const reason of await publish.getByTestId("override-reason").all())
    await reason.fill("Registreres bagudrettet");
  await publish.getByTestId("confirm-publish").click();
  await expect(page.getByText(/Vagtplanen er offentliggjort/)).toBeVisible();

  // The approval page points out planned shifts without registration.
  await page.goto(`/tid/godkend?uge=${week}`);
  await expect(page.getByTestId("missing-summary")).toBeVisible();
  await page.getByTestId("missing-summary").getByRole("link", { name: "Vis dem" }).click();
  await expect(page).toHaveURL(/status=missing/);
  const section = page.locator(`section[data-employee="${IDA}"]`);
  const missing = section.getByTestId("missing-row").filter({ hasText: "09:00–15:00" });
  await expect(missing).toBeVisible();

  // Ida left at 14:00: registered with other times than planned (the plan is the starting point).
  await missing.getByRole("button", { name: /Registrér andre tider/ }).click();
  const form = page.getByTestId("entry-form");
  await expect(form.getByLabel("Start")).toHaveValue("09:00");
  await expect(form.getByLabel("Slut")).toHaveValue("15:00");
  await form.getByLabel("Slut").fill("14:00");
  await form.getByLabel("Begrundelse for afvigelse").fill("Gik tidligt hjem");
  await form.getByRole("button", { name: "Gem registrering" }).click();
  await expect(form).toHaveCount(0);
  await page.goto(`/tid/godkend?uge=${week}`);
  await expect(
    section.getByTestId("approval-row").filter({ hasText: "09:00–14:00" }),
  ).toContainText("Afventer godkendelse");
  await expect(section.getByTestId("missing-row").filter({ hasText: "09:00–15:00" })).toHaveCount(
    0,
  );

  // Thursday without a plan: "Registrér for en medarbejder".
  await page.getByTestId("register-for").click();
  const choose = page.getByTestId("register-for-dialog");
  await choose.getByLabel("Medarbejder").selectOption({ label: IDA });
  await choose.getByLabel("Dato").fill(thursday);
  await choose.getByRole("button", { name: "Fortsæt" }).click();
  const unplanned = page.getByTestId("entry-form");
  await expect(unplanned.getByLabel("Dato")).toHaveValue(thursday);
  await unplanned.getByLabel("Start").fill("10:00");
  await unplanned.getByLabel("Slut").fill("12:00");
  await unplanned.getByTestId("break-row").getByRole("button", { name: "Fjern pause" }).click();
  await unplanned.getByLabel("Begrundelse for afvigelse").fill("Ekstra vareopfyldning");
  await unplanned.getByRole("button", { name: "Gem registrering" }).click();
  await expect(unplanned).toHaveCount(0);
  await page.goto(`/tid/godkend?uge=${week}`);
  await expect(
    section.getByTestId("approval-row").filter({ hasText: "10:00–12:00" }),
  ).toContainText("Afventer godkendelse");
});
