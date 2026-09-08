import { playwrightEvidence } from "./scripts/lib/playwright-evidence.mjs"
import { defineConfig, devices } from "@playwright/test"
import { PERFORMANCE_TIMEOUTS } from "./scripts/lib/performance-workload.mjs"

// Separate from visual tests: no screenshot tracing or retry-selected timings.
const evidence = playwrightEvidence("performance")

export default defineConfig({
  testDir: "./tests/performance",
  testMatch: "*.spec.ts",
  outputDir: evidence.outputDir,
  workers: 1,
  retries: 0,
  globalTimeout: PERFORMANCE_TIMEOUTS.globalMs,
  reporter: evidence.reporter,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  projects: [
    {
      name: "desktop-high",
      timeout:
        PERFORMANCE_TIMEOUTS.samplingMs["desktop-high"] +
        PERFORMANCE_TIMEOUTS.testOverheadMs,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile-emulation-low",
      timeout:
        PERFORMANCE_TIMEOUTS.samplingMs["mobile-emulation-low"] +
        PERFORMANCE_TIMEOUTS.testOverheadMs,
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command:
      "NEXT_PUBLIC_E2E_HOOKS=true pnpm build && pnpm start --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: PERFORMANCE_TIMEOUTS.webServerMs,
  },
})
