import { expect, type Page } from "@playwright/test";

export const users = {
  admin: "admin@demo.dk",
  manager: "leder@demo.dk",
  employee: "medarbejder@demo.dk",
  young: "ung@demo.dk",
  platform: "platform@demo.dk",
} as const;

export async function login(page: Page, email: string, password = "Demo1234!") {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill(password);
  await page.getByRole("button", { name: "Log ind", exact: true }).click();
  await expect(page).toHaveURL(/\/oversigt/);
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export async function latestLinkFor(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    ).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) {
      const msg = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
      const link = /href="([^"]+)"/.exec(msg.HTML)?.[1];
      if (link) return link.replaceAll("&amp;", "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No mail for ${email}`);
}
