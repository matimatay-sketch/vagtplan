import { expect, test, type Page } from "@playwright/test";
import { login, users } from "./helpers";

const TODAY = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const mondayOf = (date: string) => plus(date, 1 - weekday(date));
const plus = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const MADS = "Mads Medarbejder";
const EXTRA = "Ekstra opgave";
const AGREED = "Aftalt med lederen";

/** Deletes the test's reasons, so other tests see no reasons (they would be asked for one). */
async function removeReasons(page: Page) {
  await page.goto("/indstillinger/opsaetning");
  const card = page.getByTestId("deviation-reasons");
  for (const name of [EXTRA, AGREED]) {
    const item = card.locator(`li[data-reason="${name}"]`);
    while ((await item.count()) > 0) {
      await item
        .first()
        .getByRole("button", { name: `Slet ${name}` })
        .click();
      await expect(page.getByText("Årsagen er slettet.").first()).toBeVisible();
      await page.reload();
    }
  }
}

test("deviation reasons: set up, chosen when stamping and registering, changed by the manager", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.on("dialog", (d) => d.accept());
  // A day within the last two weeks (shown on Tid), not a Monday (used by the time test).
  const day5 = plus(TODAY, -5);
  const date = weekday(day5) === 1 ? plus(TODAY, -6) : day5;
  const week = mondayOf(date);

  // The administrator sets up two reasons.
  await login(page, users.admin);
  await removeReasons(page);
  const card = page.getByTestId("deviation-reasons");
  const create = async (name: string, treatment: string, situations: string[]) => {
    const form = card.getByTestId("deviation-reason-form").last();
    await form.getByLabel("Navn").fill(name);
    await form.getByLabel("Betydning for lønnen").selectOption({ label: treatment });
    for (const s of situations) await form.getByLabel(s).check();
    await form.getByRole("button", { name: "Opret årsag" }).click();
    await expect(card.locator(`li[data-reason="${name}"]`)).toBeVisible();
  };
  await create(EXTRA, "Den ekstra tid bliver afspadsering", ["går for sent"]);
  await create(AGREED, "Tiden udbetales efter overenskomsten", [
    "går for sent",
    "stempler uden vagt",
  ]);
  await expect(card.locator(`li[data-reason="${EXTRA}"]`)).toContainText(
    "Den ekstra tid bliver afspadsering · går for sent",
  );

  // The manager plans and publishes the day 07:00–15:00 for Mads.
  await page.context().clearCookies();
  await login(page, users.manager);
  await page.goto(`/vagtplan?uge=${week}`);
  const c = page.locator(`tr[data-row="${MADS}"] td[data-cell$="|${date}"]`);
  await c.hover();
  await c.getByRole("button", { name: "Ny vagt" }).click();
  const shift = page.getByTestId("shift-form");
  await shift.getByLabel("Start").fill("07:00");
  await shift.getByLabel("Slut").fill("15:00");
  await shift.getByRole("button", { name: "Gem vagt" }).click();
  await expect(shift).toHaveCount(0);
  await page.getByTestId("publish-button").click();
  const publish = page.getByTestId("publish-dialog");
  for (const reason of await publish.getByTestId("override-reason").all())
    await reason.fill("Registreres bagudrettet");
  await publish.getByTestId("confirm-publish").click();
  await expect(page.getByText(/Vagtplanen er offentliggjort/)).toBeVisible();
  await page.context().clearCookies();

  // Mads stamps in without a shift: he is asked why, and only the matching reason is offered.
  await login(page, users.employee);
  await page.goto("/tid");
  const stamp = page.getByTestId("stamp-card");
  await expect(stamp.getByTestId("stamp-status")).toHaveText("Du er ikke stemplet ind");
  await stamp.getByRole("button", { name: "Stempl ind" }).click();
  const ask = stamp.getByTestId("stamp-reason");
  await expect(ask).toContainText("Du har ingen vagt nu. Hvorfor stempler du ind?");
  await expect(ask.getByRole("radio")).toHaveCount(1);
  await expect(ask.getByRole("button", { name: "Stempl ind" })).toBeDisabled();
  await ask.getByLabel(AGREED).check();
  await ask.getByRole("button", { name: "Stempl ind" }).click();
  await expect(stamp.getByTestId("stamp-status")).toContainText("Stemplet ind kl.");
  await stamp.getByRole("button", { name: "Stempl ud" }).click();
  await expect(stamp.getByTestId("stamp-status")).toHaveText("Du er ikke stemplet ind");
  await page.reload();
  await expect(
    page.locator(`li[data-date="${TODAY}"]`).getByTestId("row-reason").first(),
  ).toHaveText(`Årsag: ${AGREED}`);

  // Registering: he left an hour late. Over the threshold a reason is required.
  const missing = page.getByTestId("missing-shift").filter({ hasText: "07:00–15:00" });
  await missing.getByRole("button", { name: "Gennemført som planlagt" }).click();
  await expect(missing).toHaveCount(0);
  const day = page.locator(`li[data-date="${date}"]`);
  const entry = day.getByTestId("time-entry");
  await entry.getByRole("button").click();
  const form = page.getByTestId("entry-form");
  await form.getByLabel("Slut").fill("16:00");
  const reasons = form.getByTestId("entry-reasons");
  await expect(reasons.getByLabel("Årsag: går for sent (slut)")).toBeVisible();
  await form.getByRole("button", { name: "Gem registrering" }).click();
  await expect(form.getByText("Vælg en årsag")).toBeVisible();
  await reasons.getByLabel("Årsag: går for sent (slut)").selectOption({ label: EXTRA });
  await form.getByRole("button", { name: "Gem registrering" }).click();
  await expect(form).toHaveCount(0);
  await expect(day.getByTestId("row-reason")).toHaveText(`Årsag: ${EXTRA}`);
  await page.context().clearCookies();

  // The manager sees the reason and changes it.
  await login(page, users.manager);
  await page.goto(`/tid/godkend?uge=${week}`);
  const row = page
    .locator(`section[data-employee="${MADS}"]`)
    .getByTestId("approval-row")
    .filter({ hasText: "07:00–16:00" });
  await expect(row.getByTestId("row-reason")).toHaveText(`Årsag: ${EXTRA}`);
  await row.getByRole("button", { name: /Redigér/ }).click();
  const edit = page.getByTestId("entry-form");
  await edit.getByLabel("Årsag: går for sent (slut)").selectOption({ label: AGREED });
  await edit.getByRole("button", { name: "Gem registrering" }).click();
  await expect(edit).toHaveCount(0);
  await expect(row.getByTestId("row-reason")).toHaveText(`Årsag: ${AGREED}`);
});

// Clean up, also after a failure: the reasons are deleted again (registrations keep them).
test.afterEach(async ({ page }) => {
  await page.context().clearCookies();
  await login(page, users.admin);
  await removeReasons(page);
});
