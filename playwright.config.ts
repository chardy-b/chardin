import { playwrightEvidence } from "./scripts/lib/playwright-evidence.mjs"
import { defineConfig, devices } from "@playwright/test"

const evidence = playwrightEvidence("browser")

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: evidence.outputDir,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: evidence.reporter,
  expect: { toHaveScreenshot: { maxDiffPixels: 0, threshold: 0 } },
  use: {
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"], colorScheme: "light" },
    },
  ],
  webServer: {
    command: "NEXT_PUBLIC_E2E_HOOKS=true pnpm build && pnpm start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
