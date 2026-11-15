import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

function mondayIn(weeks: number): string {
  const d = new Date();
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

async function addRemark(
  page: Page,
  name: string,
  condition: string,
  set: (rule: ReturnType<Page["locator"]>) => Promise<void>,
) {
  const add = page.getByTestId("add-rule");
  await add.getByLabel("Navn på reglen").fill(name);
  await add.getByLabel("Type").selectOption({ label: "Anmærkning" });
  await add.getByLabel("Betingelse").selectOption({ label: condition });
  await add.getByRole("button", { name: "Tilføj", exact: true }).click();
  const rule = page.locator(`details[data-rule^="anm-"]`).filter({ hasText: name });
  await expect(rule.getByTestId("remark-fields")).toBeVisible();
  await set(rule);
}

test("consultant sets up remarks with a limit, a severity and where they are shown", async ({
  page,
}) => {
  const week = mondayIn(-1);
  const tuesday = plus(week, 1);
  const number = Date.now().toString().slice(-6);
  const name = `Rikke Anm${number}`;
  page.on("dialog", (d) => void d.accept());

  await login(page, users.admin);
  await page.goto("/indstillinger/overenskomster");
  await page.getByRole("link", { name: "EKSEMPEL – Detail (fiktiv)", exact: true }).click();
  await expect(page.getByText("Systemskabeloner kan ikke ændres.")).toBeVisible();
  const systemUrl = page.url();
  await page.getByRole("button", { name: "Lav egen kopi" }).click();
  await expect(page.getByText("Kopien er oprettet som kladde.")).toBeVisible();
  await expect(page).not.toHaveURL(systemUrl);
  await expect(page.getByTestId("agreement-editor")).toBeVisible();
  const agreementId = page.url().split("/").at(-1)!;

  // "Vagt over 10 timer": only a note, on the schedule only.
  await addRemark(page, "Vagt over 10 timer", "Vagten er længere end", async (rule) => {
    await rule.getByLabel("Timer").fill("10");
    await rule.getByLabel("Alvor").selectOption({ label: "Info" });
    await rule.getByLabel("Godkend tid").uncheck();
  });
  // "Starter før 06:00": a warning, on registered time only.
  await addRemark(page, "Starter før 06:00", "Vagten starter før", async (rule) => {
    await rule.getByLabel("Klokkeslæt").fill("06:00");
    await rule.getByLabel("Alvor").selectOption({ label: "Advarsel" });
    await rule.getByLabel("Vagtplanen").uncheck();
  });
  const editor = page.getByTestId("agreement-editor");
  await editor.getByRole("button", { name: "Validér" }).click();
  await expect(page.getByTestId("agreement-check")).toContainText("Dokumentet er gyldigt.");
  await editor.getByRole("button", { name: "Gem kladde" }).click();
  await expect(page.getByText("Kladden er gemt.")).toBeVisible();
  await editor.getByRole("button", { name: "Publicér" }).click();
  await expect(page.getByText("Versionen er publiceret.")).toBeVisible();

  // An employee in Butik on the copy.
  await page.goto("/medarbejdere/ny");
  await page.getByLabel("Fornavn").fill("Rikke");
  await page.getByLabel("Efternavn").fill(`Anm${number}`);
  await page.getByLabel("Medarbejdernr.").fill(number);
  await page.getByLabel("Fødselsdato").fill("1990-05-01");
  await page.getByLabel("Afdeling").selectOption({ label: "Butik" });
  await page.getByRole("button", { name: "Opret" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
  await page.getByLabel("Overenskomst").selectOption(agreementId);
  await page.getByLabel("Timer pr. uge").fill("37");
  await page.getByLabel("Lønform").selectOption("hourly");
  await page.getByLabel("Lønperiode-gruppe").selectOption({ label: "Timelønnede (14 dage)" });
  await page.getByLabel("Gyldig fra").fill(plus(week, -7));
  await page.getByRole("button", { name: "Ny kontrakt" }).click();
  await expect(page.getByTestId("contract")).toHaveCount(1);

  // Tuesday 05:00–16:30 (11 h 30 min from start to end): the schedule shows the info remark only.
  await page.goto(`/vagtplan?uge=${week}`);
  const c = cell(page, name, tuesday);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const shift = page.getByTestId("shift-form");
  await shift.getByLabel("Start").fill("05:00");
  await shift.getByLabel("Slut").fill("16:30");
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  await expect(shift).toHaveCount(0);
  const icon = c.getByTestId("violation-info");
  await expect(icon).toHaveAttribute("title", "Info: Vagt over 10 timer (11 t 30 min)");

  await page.getByTestId("publish-button").click();
  const publish = page.getByTestId("publish-dialog");
  await expect(publish.getByTestId("info-violations")).toContainText(
    "Vagt over 10 timer (11 t 30 min)",
  );
  for (const reason of await publish.getByTestId("override-reason").all())
    await reason.fill("Registreres bagudrettet");
  await publish.getByTestId("confirm-publish").click();
  await expect(page.getByText(/Vagtplanen er offentliggjort/)).toBeVisible();

  // Registered as planned: approval shows the early-start warning only.
  await page.goto(`/tid/godkend?uge=${week}`);
  const section = page.locator(`section[data-employee="${name}"]`);
  await section.getByRole("button", { name: /Gennemført som planlagt/ }).click();
  const row = section.getByTestId("approval-row").filter({ hasText: "05:00–16:30" });
  const remarks = row.getByTestId("time-violations");
  await expect(remarks.locator('li[data-severity="WARNING"]')).toHaveText(
    "Starter før 06:00 (start 05:00)",
  );
  await expect(remarks).not.toContainText("Vagt over 10 timer");
});
