import { createECDH, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login, users } from "./helpers";

const MOCK = "http://127.0.0.1:4545";

/**
 * A browser push subscription that points at the local receiver. Headless
 * Chromium has no push service, so PushManager.subscribe is replaced with one
 * that returns real keys; the server encrypts and signs for them as usual.
 */
function fakeSubscription(id: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: `${MOCK}/__push/${id}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}

async function pushesTo(id: string): Promise<{ vapid: boolean; encoding: string }[]> {
  const all = (await (await fetch(`${MOCK}/__pushes`)).json()) as {
    endpoint: string;
    vapid: boolean;
    encoding: string;
  }[];
  return all.filter((p) => p.endpoint === `/__push/${id}`);
}

test("an employee turns on notifications, gets one for a new message, and subscribes the calendar", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(90_000);
  const id = `mads-${Date.now()}`;
  const sub = fakeSubscription(id);
  await context.grantPermissions(["notifications"]);
  await context.addInitScript((s) => {
    const fake = { endpoint: s.endpoint, toJSON: () => s, unsubscribe: async () => true };
    PushManager.prototype.subscribe = async () => fake as unknown as PushSubscription;
    PushManager.prototype.getSubscription = async () => null;
  }, sub);

  // Mads turns notifications on for this browser on Profil.
  await login(page, users.employee);
  await page.goto("/profil");
  const card = page.getByTestId("notifications");
  await card.getByTestId("enable-push").click();
  await expect(page.getByText("Notifikationer er slået til.")).toBeVisible();
  await expect(card.getByTestId("push-devices").locator("li")).toHaveCount(1);
  await expect(card.getByTestId("push-devices")).toContainText("Chrome");
  // Only approvers are asked about approvals.
  await expect(card.locator('[data-kind="approvals"]')).toHaveCount(0);

  // He turns off notifications about schedule changes; the choice is kept.
  await card.getByLabel("Ændringer i min vagtplan").uncheck();
  await expect(card.getByLabel("Ændringer i min vagtplan")).toBeEnabled();
  await page.reload();
  await expect(card.getByLabel("Ændringer i min vagtplan")).not.toBeChecked();
  await expect(card.getByLabel("Beskeder, vagtbytte og afbud")).toBeChecked();

  // The calendar link is shown once and opens his shifts as iCalendar.
  const calendar = page.getByTestId("calendar-feed");
  await calendar.getByTestId("create-calendar-feed").click();
  const link = calendar.getByTestId("calendar-link").getByLabel("Kalenderlink");
  await expect(link).toHaveValue(/\/api\/kalender\/[0-9a-f]{48}\.ics$/);
  const first = await link.inputValue();
  const path = new URL(first).pathname;
  const ics = await request.get(path);
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("BEGIN:VCALENDAR");
  // A new link replaces the old one.
  await calendar.getByRole("button", { name: "Lav nyt link" }).click();
  await expect(link).not.toHaveValue(first);
  expect((await request.get(path)).status()).toBe(404);
  await page.context().clearCookies();

  // Lise writes to Mads: his browser gets an encrypted, signed push.
  await login(page, users.manager);
  await page.goto("/beskeder/ny");
  await page.getByLabel("Mads Medarbejder").check();
  await page.getByLabel("Besked", { exact: true }).fill("Kan du tage en ekstra time i morgen?");
  await page.getByRole("button", { name: "Send besked" }).click();
  await expect(page).toHaveURL(/\/beskeder\/[0-9a-f-]{36}$/);
  await expect.poll(async () => (await pushesTo(id)).length, { timeout: 20_000 }).toBe(1);
  const [push] = await pushesTo(id);
  expect(push!.vapid).toBe(true);
  expect(push!.encoding).toBe("aes128gcm");
  await page.context().clearCookies();

  // Mads turns notifications off on the device again.
  await login(page, users.employee);
  await page.goto("/profil");
  await card.getByRole("button", { name: /Slå notifikationer fra på Chrome/ }).click();
  await expect(card.getByText("Ingen enheder endnu.")).toBeVisible();
});
