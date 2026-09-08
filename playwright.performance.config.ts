import { defineConfig, devices } from "@playwright/test"

// Separate from visual tests: no screenshot tracing or retry-selected timings.
export default defineConfig({
  testDir: "./tests/performance",
  testMatch: "*.spec.ts",
  outputDir: "test-results/performance",
  workers: 1,
  retries: 0,
  timeout: 150_000,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/performance-tests.json" }],
  ],
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
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    { name: "mobile-emulation-low", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command:
      "NEXT_PUBLIC_E2E_HOOKS=true pnpm build && pnpm start --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
