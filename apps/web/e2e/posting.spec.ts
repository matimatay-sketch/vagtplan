import { expect, test, type Page } from "@playwright/test";
import { login, users, openMoreSettings } from "./helpers";

const local = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
const plus = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return plus(date, -((d.getUTCDay() || 7) - 1));
};
/** The 14-day pay period (anchored on 5 January 2026) that contains `date`. */
function biweeklyStart(date: string): string {
  const anchor = Date.UTC(2026, 0, 5);
  const n = Math.floor((Date.parse(`${date}T00:00:00Z`) - anchor) / (14 * 86_400_000));
  return new Date(anchor + n * 14 * 86_400_000).toISOString().slice(0, 10);
}

async function addEmployee(
  page: Page,
  firstName: string,
  lastName: string,
  number: string,
  from: string,
) {
  await page.goto("/medarbejdere/ny");
  await page.getByLabel("Fornavn").fill(firstName);
  await page.getByLabel("Efternavn").fill(lastName);
  await page.getByLabel("Medarbejdernr.").fill(number);
  await page.getByLabel("Fødselsdato").fill("1990-05-01");
  await page.getByLabel("Afdeling").selectOption({ label: "Butik" });
  await page.getByRole("button", { name: "Opret" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(lastName) })).toBeVisible();
  await page.getByLabel("Overenskomst").selectOption({ label: "EKSEMPEL – Detail (fiktiv)" });
  await page.getByLabel("Timer pr. uge").fill("37");
  await page.getByLabel("Lønform").selectOption("hourly");
  await page.getByLabel("Lønperiode-gruppe").selectOption({ label: "Timelønnede (14 dage)" });
  await page.getByLabel("Gyldig fra").fill(from);
  await page.getByRole("button", { name: "Ny kontrakt" }).click();
  await expect(page.getByTestId("contract")).toHaveCount(1);
}

test("cost centres: set up, default per employee, posted on a shift, split in pay lines", async ({
  page,
}) => {
  // A day in an earlier pay period than the one the payroll test closes.
  const day = local(new Date(Date.now() - 20 * 86_400_000));
  const week = mondayOf(day);
  const n = Date.now().toString(36).slice(-5);
  const dim = `Omkostningssted ${n}`;
  const name = `Karl Kontering${n}`;
  await login(page, users.admin);

  // 1. The consultant sets up the dimension and its values.
  await page.goto("/indstillinger/kontering");
  const nd = page.getByTestId("new-dimension");
  await nd.getByLabel("Navn").fill(dim);
  await nd.getByLabel(/Nøgle/).fill(`oms_${n}`);
  await nd.getByRole("button", { name: "Ny dimension" }).click();
  const section = page.locator(`section[data-dimension="oms_${n}"]`);
  await expect(section).toBeVisible();
  for (const [code, label] of [
    ["1100", "Butik"],
    ["1200", "Lager"],
  ]) {
    const nv = section.getByTestId("new-value");
    await nv.getByLabel("Kode").fill(code!);
    await nv.getByLabel("Navn").fill(label!);
    await nv.getByRole("button", { name: "Ny værdi" }).click();
    await expect(section.locator(`tr[data-value="${code}"]`)).toBeVisible();
  }

  // 2. A new employee whose standard cost centre is 1100.
  await addEmployee(
    page,
    "Karl",
    `Kontering${n}`,
    `9${Date.now().toString().slice(-5)}`,
    plus(day, -30),
  );
  const defaults = page.getByTestId("posting-defaults-employee");
  await defaults.getByLabel(dim).selectOption({ label: "1100 · Butik" });
  await defaults.getByRole("button", { name: "Gem standardkontering" }).click();
  await expect(page.getByText("Gemt.")).toBeVisible();

  // 3. A shift 08–16 with 3 hours on 1200; the rest falls back to the standard (1100).
  await page.goto(`/vagtplan?uge=${week}`);
  const cell = page.locator(`tr[data-row="${name}"] td[data-cell$="|${day}"]`);
  await cell.hover();
  await cell.getByRole("button", { name: "Ny vagt" }).click();
  const shift = page.getByTestId("shift-form");
  await shift.getByLabel("Start").fill("08:00");
  await shift.getByLabel("Slut").fill("16:00");
  await shift.getByTestId("break-row").getByRole("button", { name: "Fjern pause" }).click();
  await openMoreSettings(shift);
  const editor = shift.getByTestId("posting-editor");
  await editor.getByRole("button", { name: "Tilføj kontering" }).click();
  await editor.getByLabel(`${dim} 1`).selectOption({ label: "1200 · Lager" });
  await editor.getByLabel("Fordeling 1").selectOption("minutes");
  await editor.getByLabel("Minutter 1").fill("180");
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  await expect(shift).toHaveCount(0);
  await page.getByTestId("publish-button").click();
  const publish = page.getByTestId("publish-dialog");
  for (const reason of await publish.getByTestId("override-reason").all())
    await reason.fill("Registreres bagudrettet");
  await publish.getByTestId("confirm-publish").click();
  await expect(page.getByText(/Vagtplanen er offentliggjort/)).toBeVisible();

  // 4. Registered as planned (the posting follows the shift) and approved.
  await page.goto(`/tid/godkend?uge=${week}`);
  const emp = page.locator(`section[data-employee="${name}"]`);
  await emp.getByRole("button", { name: /Gennemført som planlagt/ }).click();
  const row = emp.getByTestId("approval-row").filter({ hasText: "08:00–16:00" });
  await expect(row.getByTestId("row-posting")).toHaveText("1");
  await row.getByRole("checkbox").check();
  await page.getByTestId("approve-selected").click();
  await expect(row).toContainText("Godkendt");

  // 5. Pay lines are split by cost centre: 5 h on 1100, 3 h on 1200 at 150 kr.
  await page.goto("/lon");
  await page
    .locator(`tr[data-period="Timelønnede (14 dage)|${biweeklyStart(day)}"]`)
    .getByRole("link", { name: "Åbn" })
    .click();
  await page.getByRole("button", { name: "Beregn alle" }).click();
  await expect(page.getByText(/medarbejdere? beregnet/)).toBeVisible();
  const lines = page.locator(`section[data-employee="${name}"] tr[data-pay-code="NORMAL"]`);
  await expect(lines).toHaveCount(2);
  await expect(lines.filter({ hasText: `${dim} 1100` })).toContainText("5,00 t");
  await expect(lines.filter({ hasText: `${dim} 1100` })).toContainText("750,00");
  await expect(lines.filter({ hasText: `${dim} 1200` })).toContainText("3,00 t");
  await expect(lines.filter({ hasText: `${dim} 1200` })).toContainText("450,00");
});
