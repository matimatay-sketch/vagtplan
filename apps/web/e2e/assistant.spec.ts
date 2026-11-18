import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

// The app talks to e2e/mock-anthropic.mjs (ANTHROPIC_BASE_URL), never to the real API.
const MOCK = "http://127.0.0.1:4545";
type Recorded = { requests: { system: string; messages: { content: unknown }[] }[] };
const recorded = async (): Promise<Recorded> => (await fetch(`${MOCK}/__requests`)).json();
const PERSONAL = ["Mads", "Lise", "Ida", "Ida Ung", "Lise Leder", "Butik", "demo.dk", "1002"];

function mondayIn(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 * weeks);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}
const local = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
function biweeklyStart(date: string): string {
  const anchor = Date.UTC(2026, 0, 5);
  const t = Date.parse(`${date}T00:00:00Z`);
  const n = Math.floor((t - anchor) / (14 * 86_400_000));
  return new Date(anchor + n * 14 * 86_400_000).toISOString().slice(0, 10);
}

test("the AI assistant: off by default, pseudonymized, proposals as drafts, pay explained", async ({
  page,
}) => {
  await fetch(`${MOCK}/__reset`, { method: "POST" });
  await login(page, users.admin);
  const week = mondayIn(41);

  // Off by default: no button on the schedule.
  await page.goto(`/vagtplan?uge=${week}`);
  await expect(page.getByTestId("propose-button")).toHaveCount(0);

  await page.goto("/indstillinger/opsaetning");
  const settings = page.getByTestId("assistant-settings");
  await expect(settings.getByTestId("assistant-status")).toHaveText("Slået fra");
  await settings.getByRole("button", { name: "Slå AI-assistenten til" }).click();
  await expect(settings.getByTestId("assistant-status")).toHaveText("Slået til");

  // A proposal for Butik: names in the instructions are replaced before sending.
  await page.goto(`/vagtplan?uge=${week}`);
  await page.getByTestId("propose-button").click();
  const dialog = page.getByTestId("propose-dialog");
  await dialog
    .getByLabel("Ønsker til ugen")
    .fill("Åbning mandag 8–16 med to personer. Mads Medarbejder vil gerne have fri fredag.");
  await dialog.getByRole("button", { name: "Foreslå med AI" }).click();
  await expect(page.getByText(/2 kladdevagter oprettet\./)).toBeVisible({ timeout: 20_000 });
  await expect(dialog).toHaveCount(0);
  // The unknown person in the first answer was reported back: two calls, nothing personal sent.
  const calls = (await recorded()).requests;
  expect(calls).toHaveLength(2);
  const sent = JSON.stringify(calls);
  for (const word of PERSONAL) expect(sent).not.toContain(word);
  expect(sent).toContain("MEDARBEJDER_1");
  expect(sent).toContain("ukendt medarbejder");

  // The drafts are on the board, marked as AI, and the note is shown with names.
  await expect(page.getByTestId("proposal-badge")).toHaveCount(2);
  const banner = page.getByTestId("proposal-banner");
  await expect(banner).toContainText("Ugen har 2 vagter fra et AI-forslag.");
  await expect(banner).not.toContainText("MEDARBEJDER_");
  await banner.getByRole("button", { name: "Kassér forslaget" }).click();
  await expect(page.getByTestId("proposal-banner")).toHaveCount(0);
  await expect(page.getByTestId("proposal-badge")).toHaveCount(0);

  // Pay explanation for a calculated period.
  await fetch(`${MOCK}/__reset`, { method: "POST" });
  const day = local(new Date(Date.now() - 70 * 86_400_000));
  await page.goto("/lon");
  await page
    .locator(`tr[data-period="Timelønnede (14 dage)|${biweeklyStart(day)}"]`)
    .getByRole("link", { name: "Åbn" })
    .click();
  await page.getByRole("button", { name: "Beregn alle" }).click();
  await expect(page.getByText(/medarbejdere? beregnet/)).toBeVisible();
  const mads = page.locator('section[data-employee="Mads Medarbejder"]');
  await mads.getByTestId("ask-pay").click();
  const ask = page.getByTestId("ask-pay-dialog");
  await ask.getByLabel("Spørgsmål").fill("Hvorfor har Mads ingen aftentillæg?");
  await ask.getByRole("button", { name: "Spørg" }).click();
  // The answer comes back with the code replaced by the name.
  await expect(ask.getByTestId("pay-answer")).toContainText("Mads Medarbejder har ingen lønlinjer");
  const payCall = JSON.stringify((await recorded()).requests);
  for (const word of PERSONAL) expect(payCall).not.toContain(word);

  // Turn it off again for other tests.
  await page.goto("/indstillinger/opsaetning");
  await page.getByRole("button", { name: "Slå AI-assistenten fra" }).click();
  await expect(page.getByTestId("assistant-status")).toHaveText("Slået fra");
});
