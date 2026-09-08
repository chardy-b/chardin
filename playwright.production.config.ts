import { playwrightEvidence } from "./scripts/lib/playwright-evidence.mjs"
import { defineConfig } from "@playwright/test"

const evidence = playwrightEvidence("production")

export default defineConfig({
  testDir: "./tests/production",
  outputDir: evidence.outputDir,
  reporter: evidence.reporter,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  // Run immediately after the ordinary production build, before the E2E build.
  webServer: {
    command: "pnpm start --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
  },
})
