import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "da-DK",
    timezoneId: "Europe/Copenhagen",
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    // Stand-in for the Anthropic API (the assistant tests never call the real one).
    {
      command: "node e2e/mock-anthropic.mjs",
      url: "http://127.0.0.1:4545/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
      url: `${baseURL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ANTHROPIC_API_KEY: "e2e-test-key",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:4545",
        // The webhook receiver in the mock is on http://127.0.0.1.
        WEBHOOK_ALLOW_INSECURE: "1",
      },
    },
  ],
});
