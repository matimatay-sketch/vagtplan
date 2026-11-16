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

test("trips and expenses: rates as data, logbook, receipt, approval and pay lines", async ({
  page,
}) => {
  // Far enough back not to share a pay period with the other payroll tests.
  const day = local(new Date(Date.now() - 45 * 86_400_000));
  const year = day.slice(0, 4);

  // The admin enters test rates for the year (not real rates) and a category.
  await login(page, users.admin);
  await page.goto("/indstillinger/koersel");
  const rates = page.getByTestId("mileage-rates");
  if ((await rates.locator(`li[data-year="${year}"]`).count()) === 0) {
    const rf = page.getByTestId("mileage-rate-form");
    await rf.getByLabel("År", { exact: true }).fill(year);
    await rf.getByLabel("Høj sats (kr. pr. km)").fill("1,00");
    await rf.getByLabel("Km-grænse pr. år").fill("1000");
    await rf.getByLabel("Lav sats (kr. pr. km)").fill("0,50");
    await rf.getByLabel("Lønart, høj sats").fill("km_hoej");
    await rf.getByLabel("Lønart, lav sats").fill("km_lav");
    await rf.getByLabel("Kilde").fill("Testsatser til e2e");
    await rf.getByRole("button", { name: "Gem satser" }).click();
  }
  await expect(rates.locator(`li[data-year="${year}"]`)).toContainText(
    "1,00 kr./km op til 1.000 km, derefter 0,50 kr./km",
  );
  const category = `Parkering ${Date.now().toString(36)}`;
  const cf = page.getByTestId("expense-category-form");
  await cf.getByLabel("Navn").fill(category);
  await cf.getByLabel("Lønart").fill("PARK");
  await cf.getByRole("button", { name: "Opret kategori" }).click();
  await expect(page.getByTestId("expense-categories")).toContainText(category);
  await page.context().clearCookies();

  // Mads registers a trip with a stop and a parking expense with a receipt.
  await login(page, users.employee);
  await page
    .getByRole("navigation", { name: "Hovedmenu" })
    .getByRole("link", { name: "Kørsel og udlæg" })
    .click();
  const trip = page.getByTestId("trip-form");
  await trip.getByLabel("Dato").fill(day);
  await trip.getByLabel("Formål").fill("Kundebesøg hos Grossisten");
  await trip.getByLabel("Km").fill("42,5");
  await trip.getByLabel("Fra (adresse)").fill("Butikken, Hovedgaden 1");
  await trip.getByLabel("Til (adresse)").fill("Grossisten, Industrivej 9");
  await trip.getByRole("button", { name: "Tilføj stop" }).click();
  await trip.getByLabel("Stop 1").fill("Lageret, Havnevej 3");
  await trip.getByRole("button", { name: "Registrér kørsel" }).click();
  await expect(page.getByText("Kørslen er registreret.")).toBeVisible();

  const exp = page.getByTestId("expense-form");
  await exp.getByLabel("Dato").fill(day);
  await exp.getByLabel("Kategori").selectOption({ label: category });
  await exp.getByLabel("Beløb (kr.)").fill("45,00");
  await exp.getByLabel("Beskrivelse").fill("P-billet ved Grossisten");
  // Without a receipt the category refuses.
  await exp.getByRole("button", { name: "Registrér udlæg" }).click();
  await expect(exp.getByText("Vedhæft en kvittering.", { exact: false })).toBeVisible();
  await exp.getByLabel("Kvittering").setInputFiles({
    name: "kvittering.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% e2e\n"),
  });
  await exp.getByRole("button", { name: "Registrér udlæg" }).click();
  await expect(page.getByText("Udlægget er registreret.")).toBeVisible();

  const items = page.getByTestId("expense-items");
  const tripItem = items.locator('[data-kind="trip"]').filter({ hasText: "Grossisten" });
  await expect(tripItem).toContainText("42,5 km");
  await expect(tripItem).toContainText("via Lageret, Havnevej 3");
  await expect(tripItem).toContainText("Afventer godkendelse");
  const expItem = items.locator('[data-kind="expense"]').filter({ hasText: category });
  await expect(expItem).toContainText("45,00 kr.");
  await expect(expItem.getByTestId("receipt-link")).toBeVisible();
  await page.context().clearCookies();

  // The manager (same approver as time) opens the receipt and approves both.
  await login(page, users.manager);
  await page.goto(`/tid/godkend?uge=${day}`);
  const approval = page.getByTestId("expense-approval");
  const a1 = approval.locator('[data-kind="trip"]').filter({ hasText: "Grossisten" });
  const a2 = approval.locator('[data-kind="expense"]').filter({ hasText: category });
  const href = await a2.getByTestId("receipt-link").getAttribute("href");
  const receipt = await page.request.get(href!, { maxRedirects: 0 });
  expect(receipt.status()).toBeGreaterThanOrEqual(300);
  expect(receipt.headers()["location"]).toContain("/storage/v1/object/sign/receipts/");
  await a1.getByRole("checkbox").check();
  await a2.getByRole("checkbox").check();
  await page.getByTestId("approve-expenses").click();
  await expect(page.getByText("2 poster godkendt.")).toBeVisible();
  await expect(a1).toContainText("Godkendt");
  await page.context().clearCookies();

  // The pay run has the km at the high rate and the expense (calculated by hand:
  // 42,5 km × 1,00 kr. = 42,50 kr.; parking 45,00 kr.).
  await login(page, users.admin);
  await page.goto("/lon");
  await page
    .locator(`tr[data-period="Timelønnede (14 dage)|${biweeklyStart(day)}"]`)
    .getByRole("link", { name: "Åbn" })
    .click();
  await page.getByRole("button", { name: "Beregn alle" }).click();
  await expect(page.getByText(/medarbejdere? beregnet/)).toBeVisible();
  const mads = page.locator('section[data-employee="Mads Medarbejder"]');
  const km = mads.locator('tr[data-pay-code="KM_HOEJ"]');
  await expect(km).toContainText("42,5 km");
  await expect(km).toContainText("42,50");
  await km.getByText("Hvorfor?").click();
  await expect(km).toContainText("Testsatser til e2e");
  await expect(mads.locator('tr[data-pay-code="PARK"]')).toContainText("45,00");
});
