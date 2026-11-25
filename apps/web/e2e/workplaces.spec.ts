import { expect, test, type Browser, type Page } from "@playwright/test";
import { login, users } from "./helpers";

const LAGER = { latitude: 56.1629, longitude: 10.2039 };
/** About 120 m north of Lager (radius 200). */
const NEAR = { latitude: 56.164, longitude: 10.2039, accuracy: 10 };
/** Copenhagen: far from any workplace. */
const FAR = { latitude: 55.6761, longitude: 12.5683, accuracy: 10 };
const PLACE = "E2E Lager";

async function setOption(page: Page, option: string, on: boolean) {
  await page.goto("/indstillinger/opsaetning");
  const row = page.getByTestId(`option-${option}`);
  const status = row.getByTestId(`option-${option}-status`);
  if ((await status.textContent()) !== (on ? "Slået til" : "Slået fra")) {
    await row.getByRole("button", { name: on ? /^Slå til/ : /^Slå fra/ }).click();
    await expect(status).toHaveText(on ? "Slået til" : "Slået fra");
  }
}

async function employeePage(browser: Browser, position: typeof NEAR) {
  const context = await browser.newContext({
    geolocation: position,
    permissions: ["geolocation"],
  });
  const page = await context.newPage();
  await login(page, users.employee);
  return { context, page };
}

test("wishes can be switched off for the organization and on again for a department", async ({
  page,
  browser,
}) => {
  await login(page, users.admin);
  await setOption(page, "availability_enabled", false);

  const { context, page: emp } = await employeePage(browser, NEAR);
  await emp.goto("/min-vagtplan");
  await expect(emp.getByTestId("availability-form")).toHaveCount(0);

  // Butik takes wishes although the organization does not.
  await page.goto("/afdelinger");
  const form = page.getByTestId("department-messaging-Butik");
  await form.getByLabel("Medarbejderønsker").selectOption({ label: "Slået til" });
  await form.getByRole("button", { name: "Gem afdelingens indstillinger" }).click();
  await expect(form.getByText("Gemt")).toBeVisible();
  await emp.reload();
  await expect(emp.getByTestId("wishes-card")).toBeVisible();
  await expect(emp.getByTestId("availability-form")).toBeVisible();

  // Back to the default: the department follows the organization, which takes wishes.
  await form
    .getByLabel("Medarbejderønsker")
    .selectOption({ label: "Som virksomheden (slået fra)" });
  await form.getByRole("button", { name: "Gem afdelingens indstillinger" }).click();
  await expect(form.getByText("Gemt")).toBeVisible();
  await setOption(page, "availability_enabled", true);
  await context.close();
});

test("stamping only at the workplace: inside the radius it is registered, outside it is turned down", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  page.on("dialog", (d) => d.accept());
  await login(page, users.admin);
  // Cannot be switched on before there is a workplace.
  await page.goto("/indstillinger/arbejdspladser");
  for (const old of await page.locator(`li[data-workplace="${PLACE}"]`).all())
    await old.getByRole("button", { name: `Slet ${PLACE}` }).click();
  await expect(page.locator(`li[data-workplace="${PLACE}"]`)).toHaveCount(0);

  const form = page.getByTestId("workplace-form");
  await form.getByLabel("Navn").fill(PLACE);
  await form.getByLabel("Position").fill(`${LAGER.latitude}, ${LAGER.longitude}`);
  await form.getByLabel("Radius i meter").fill("200");
  await form.getByRole("button", { name: "Opret arbejdsplads" }).click();
  const item = page.locator(`li[data-workplace="${PLACE}"]`);
  await expect(item).toContainText("200 m · Alle afdelinger");

  // The employee is not stamped in when the test starts.
  const { context, page: emp } = await employeePage(browser, NEAR);
  await emp.goto("/tid");
  const card = emp.getByTestId("stamp-card");
  if (await card.getByRole("button", { name: "Stempl ud" }).isVisible()) {
    await card.getByRole("button", { name: "Stempl ud" }).click();
    await expect(card.getByRole("button", { name: "Stempl ind" })).toBeVisible();
  }

  await setOption(page, "geofence_enabled", true);

  // Far away: explained once, then turned down.
  await context.setGeolocation(FAR);
  await emp.reload();
  await card.getByRole("button", { name: "Stempl ind" }).click();
  await expect(emp.getByTestId("location-explain")).toContainText("Turnus bruger din placering");
  await emp.getByRole("button", { name: "Fortsæt" }).click();
  await expect(card.getByRole("status")).toContainText("Du er ikke på din arbejdsplads");
  await expect(card.getByTestId("stamp-status")).toHaveText("Du er ikke stemplet ind");

  // Near: registered with the workplace and the distance.
  await context.setGeolocation(NEAR);
  await card.getByRole("button", { name: "Stempl ind" }).click();
  await expect(emp.getByTestId("location-explain")).toHaveCount(0);
  await expect(card.getByRole("status")).toHaveText("Stemplingen er registreret.");
  await expect(card.getByTestId("stamp-status")).toContainText("Stemplet ind kl.");
  await card.getByRole("button", { name: "Stempl ud" }).click();
  await expect(card.getByRole("status")).toHaveText("Stemplingen er registreret.");
  await expect(card.getByRole("button", { name: "Stempl ind" })).toBeVisible();
  await emp.reload();
  await expect(emp.getByTestId("row-stamp-place").first()).toContainText(`ved ${PLACE}`);

  // Clean up: switch it off again and delete the workplace.
  await setOption(page, "geofence_enabled", false);
  await page.goto("/indstillinger/arbejdspladser");
  await page
    .locator(`li[data-workplace="${PLACE}"]`)
    .getByRole("button", { name: `Slet ${PLACE}` })
    .click();
  await expect(page.locator(`li[data-workplace="${PLACE}"]`)).toHaveCount(0);
  await context.close();
});
