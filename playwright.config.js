import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./e2e/helpers.js";

// Browser tests against a running stack (app + API), by default the one
// from drawdb-server/compose.e2e.yaml. See e2e/README.md.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Tests make their own accounts, so they can run side by side
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1400, height: 850 },
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1400, height: 850 },
        // E2E_CHANNEL=chrome uses the installed Chrome instead of
        // Playwright's own browser (npx playwright install chromium)
        channel: process.env.E2E_CHANNEL || undefined,
      },
    },
  ],
});
