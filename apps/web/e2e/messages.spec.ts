import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Monday `weeks` weeks from now. */
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

async function switchUser(page: Page, email: string) {
  await page.context().clearCookies();
  await login(page, email);
}

async function setMessageEmail(page: Page, on: boolean) {
  await page.goto("/afdelinger");
  const form = page.getByTestId("department-messaging-Butik");
  const box = form.getByLabel("Send også nye beskeder på e-mail");
  if ((await box.isChecked()) !== on) await box.setChecked(on);
  await form.getByRole("button", { name: "Gem beskedindstillinger" }).click();
  await expect(form.getByText("Gemt")).toBeVisible();
}

async function mailsTo(email: string, subject: string) {
  const q = encodeURIComponent(`to:${email} subject:"${subject}"`);
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${q}`).then((x) => x.json());
    if (r.messages?.length) return r.messages as { ID: string; Subject: string }[];
    await new Promise((res) => setTimeout(res, 500));
  }
  return [];
}

test("an employee writes to the leader, who replies; the e-mail only says there is a message", async ({
  page,
}) => {
  await login(page, users.admin);
  await setMessageEmail(page, true);

  const text = `Kan jeg få fri fredag? ${Date.now().toString(36)}`;
  await switchUser(page, users.employee);
  await page.goto("/beskeder/ny");
  await page.getByLabel("Lise Leder").check();
  await page.getByLabel("Besked", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Send besked" }).click();
  await expect(page).toHaveURL(/\/beskeder\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("message").filter({ hasText: text })).toBeVisible();

  await switchUser(page, users.manager);
  await expect(page.getByTestId("message-count").first()).toBeVisible();
  await page.goto("/beskeder");
  const row = page.getByTestId("conversation-row").filter({ hasText: text });
  await expect(row.getByTestId("unread-badge")).toBeVisible();
  await row.click();
  await page.getByLabel("Skriv et svar").fill("Ja, det er helt fint");
  await page.getByRole("button", { name: "Send svar" }).click();
  await expect(page.getByTestId("message").filter({ hasText: "helt fint" })).toBeVisible();

  const mails = await mailsTo(users.employee, "Ny besked fra Lise Leder i Turnus");
  expect(mails.length).toBeGreaterThan(0);
  const mail = await fetch(`${MAILPIT}/api/v1/message/${mails[0]!.ID}`).then((x) => x.json());
  expect(mail.Text).toContain("/beskeder/");
  expect(mail.Text).not.toContain("helt fint");

  // The employee sees the reply.
  await switchUser(page, users.employee);
  await page.goto("/beskeder");
  await page.getByTestId("conversation-row").filter({ hasText: "helt fint" }).click();
  await expect(page.getByTestId("message").filter({ hasText: "helt fint" })).toBeVisible();

  await switchUser(page, users.admin);
  await setMessageEmail(page, false);
});

test("a swap is accepted by the colleague and approved by the leader; an afbud reaches the leader", async ({
  page,
}) => {
  // A week no other spec uses (the board is shared).
  const week = mondayIn(20);
  const saturday = plus(week, 5);
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  const cell = page.locator(`tr[data-row="Mads Medarbejder"] td[data-cell$="|${saturday}"]`);
  await cell.hover();
  await cell.getByRole("button", { name: "Ny vagt" }).click();
  const form = page.getByTestId("shift-form");
  await form.getByLabel("Start").fill("09:00");
  await form.getByLabel("Slut").fill("13:00");
  await form.getByTestId("break-row").first().getByRole("button", { name: "Fjern pause" }).click();
  await form.getByRole("button", { name: "Gem vagt" }).click();
  await expect(form).toHaveCount(0);
  await page.getByTestId("publish-button").click();
  await page.getByTestId("publish-dialog").getByTestId("confirm-publish").click();
  await expect(page.getByText(/Vagtplanen er offentliggjort/)).toBeVisible();

  // Mads offers the shift to Ida.
  await switchUser(page, users.employee);
  await page.goto(`/min-vagtplan?uge=${week}`);
  const shift = page.getByTestId("my-shift").filter({ hasText: "09:00–13:00" });
  await shift.getByTestId("swap-shift").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Kollega", { exact: true }).selectOption({ label: "Ida Ung" });
  await dialog.getByLabel("Besked til kollegaen (valgfrit)").fill("Kan du tage den?");
  await dialog.getByRole("button", { name: "Send forslaget" }).click();
  await expect(shift.getByTestId("swap-pending")).toContainText("Ida Ung");

  // Ida accepts; the department requires the leader's approval.
  await switchUser(page, users.young);
  await page.goto("/beskeder");
  const waiting = page.getByTestId("waiting");
  await waiting.getByTestId("swap-accept").click();
  await expect(page.getByText("Du har accepteret. En leder skal godkende byttet.")).toBeVisible();
  await expect(page.getByTestId("waiting")).toHaveCount(0);

  // Lise approves; the shift moves to Ida.
  await switchUser(page, users.manager);
  await page.goto("/beskeder");
  await page.getByTestId("waiting").getByTestId("swap-approve").click();
  await expect(page.getByText("Byttet er gennemført, og vagtplanen er opdateret.")).toBeVisible();

  await switchUser(page, users.young);
  await page.goto(`/min-vagtplan?uge=${week}`);
  const idas = page.getByTestId("my-shift").filter({ hasText: "09:00–13:00" });
  await expect(idas).toBeVisible();

  // Ida cannot come after all and reports it.
  await idas.getByTestId("report-cancellation").click();
  const cancel = page.getByRole("dialog");
  await cancel.getByLabel("Hvorfor kan du ikke komme?").fill("Syg");
  await cancel.getByRole("button", { name: "Send afbud til lederen" }).click();
  await expect(idas.getByTestId("cancellation-reported")).toBeVisible();

  await switchUser(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  const card = page
    .locator(`tr[data-row="Ida Ung"] td[data-cell$="|${saturday}"]`)
    .getByTestId("shift-card");
  await expect(card.getByTestId("uncovered-badge")).toHaveText("Afbud");
  await page.goto("/beskeder");
  await page.getByTestId("waiting").getByTestId("cancellation-resolve").first().click();
  await expect(page.getByText("Afbuddet er markeret som håndteret.")).toBeVisible();
  await expect(page.getByTestId("waiting")).toHaveCount(0);
});

test('"Kun til ledere" lets an employee write only to the leaders', async ({ page }) => {
  await login(page, users.admin);
  await page.goto("/indstillinger/rettigheder");
  await page.getByRole("link", { name: /^Medarbejder Standard/ }).click();
  const matrix = page.getByTestId("grant-matrix");
  const choose = async (label: string) => {
    await matrix
      .getByRole("radiogroup", { name: /Hvem man kan skrive til/ })
      .getByText(label)
      .click();
    await matrix.getByRole("button", { name: "Gem rettigheder" }).click();
    await expect(matrix.getByText("Gemt")).toBeVisible();
  };
  await choose("Kun til ledere");

  await switchUser(page, users.employee);
  await page.goto("/beskeder/ny");
  await expect(page.getByLabel("Lise Leder")).toBeVisible();
  await expect(page.getByLabel("Ida Ung")).toHaveCount(0);

  await switchUser(page, users.admin);
  await page.goto("/indstillinger/rettigheder");
  await page.getByRole("link", { name: /^Medarbejder Standard/ }).click();
  await choose("Egne afdelinger");
});
