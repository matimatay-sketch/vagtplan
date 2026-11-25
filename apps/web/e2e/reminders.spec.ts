import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

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

async function mailsTo(email: string, subject: string) {
  const q = encodeURIComponent(`to:${email} subject:"${subject}"`);
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${q}`).then((x) => x.json());
    if (r.messages?.length) return r.messages as { ID: string }[];
    await new Promise((res) => setTimeout(res, 500));
  }
  return [];
}

test("a manager sets up a reminder about missing registrations and sends it; the employee gets a message and an e-mail", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  // Last week's Wednesday: a published shift for Ida without a registration.
  const wednesday = plus(mondayIn(-1), 2);
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${mondayIn(-1)}`);
  const c = cell(page, IDA, wednesday);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const shift = page.getByTestId("shift-form");
  await shift.getByLabel("Start").fill("09:00");
  await shift.getByLabel("Slut").fill("13:00");
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  await expect(shift).toHaveCount(0);
  await page.getByTestId("publish-button").click();
  const publish = page.getByTestId("publish-dialog");
  for (const reason of await publish.getByTestId("override-reason").all())
    await reason.fill("Registreres bagudrettet");
  await publish.getByTestId("confirm-publish").click();
  await expect(page.getByText(/Vagtplanen er offentliggjort/)).toBeVisible();

  // The reminder: missing registrations, only for Ida, automatic on Mondays.
  await page.goto("/tid/godkend");
  await page.getByRole("link", { name: "Påmindelser" }).click();
  await expect(page).toHaveURL(/\/tid\/godkend\/paamindelser/);
  const name = `Husk tiden ${Date.now().toString(36)}`;
  const form = page.getByTestId("reminder-form").first();
  await form.getByLabel("Navn").fill(name);
  await form
    .getByLabel("Påmind om")
    .selectOption({ label: "Planlagte vagter uden registreret tid (til medarbejderen)" });
  await expect(form.getByLabel("Butik")).toBeChecked();
  await form.getByLabel(IDA).check();
  await form.getByLabel("Egen tekst i påmindelsen (valgfri)").fill("Det tager to minutter.");
  await form.getByLabel("Send automatisk").check();
  await form.getByRole("group", { name: "Ugedage" }).getByLabel("Tir").uncheck();
  await form.getByRole("button", { name: "Opret påmindelse" }).click();
  await expect(page.getByText("Påmindelsen er oprettet.")).toBeVisible();
  const rule = page.locator(`li[data-reminder="${name}"]`);
  await expect(rule).toContainText("Manglende registrering");
  await expect(rule).toContainText("Automatisk: Man, Ons, Tor, Fre");

  // It can also repeat on a day each quarter.
  await rule.getByText("Ret påmindelsen").click();
  const edit = rule.getByTestId("reminder-form");
  await edit.getByLabel("Gentag").selectOption({ label: "Hvert kvartal" });
  await edit.getByLabel("Dag i måneden").fill("31");
  await edit.getByLabel("Måned i kvartalet").selectOption({ index: 2 });
  await edit.getByRole("button", { name: "Gem påmindelse" }).click();
  await expect(rule).toContainText("Automatisk den 31. i kvartalets 3. måned");
  await expect(rule).toContainText("Næste gang:");

  // Who gets it, then send now.
  await rule.getByRole("button", { name: "Hvem får den?" }).click();
  await expect(rule.getByTestId("reminder-preview")).toContainText(IDA);
  await rule.getByTestId("send-reminder").click();
  await expect(page.getByText(/Påmindelsen er sendt til 1 person\./)).toBeVisible();
  await expect(rule).toContainText("Sidst sendt");
  await page.context().clearCookies();

  // Ida has the reminder under Beskeder, and an e-mail.
  await login(page, users.young);
  await page.goto("/beskeder");
  await page.getByTestId("conversation-row").filter({ hasText: name }).click();
  const reminder = page.getByTestId("reminder-message").last();
  await expect(reminder).toContainText("Påmindelse: Du har");
  await expect(reminder).toContainText("Det tager to minutter.");
  await expect(reminder.getByRole("link", { name: "Åbn" })).toHaveAttribute("href", "/tid");
  expect((await mailsTo(users.young, "Påmindelse fra Turnus")).length).toBeGreaterThan(0);
});

test("an employee cannot set up reminders", async ({ page }) => {
  await login(page, users.employee);
  await page.goto("/tid/godkend/paamindelser");
  await expect(page).not.toHaveURL(/paamindelser/);
});
