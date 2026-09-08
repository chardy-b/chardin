import { defineConfig } from "@playwright/test"
import performanceConfig from "./playwright.performance.config"

// Controller-only scene collection. Select one --project and one --grep scene
// per invocation; preserve all Wave 1 process, sampling and timeout ownership.
export default defineConfig(performanceConfig, {
  testMatch: "skyspace.performance.spec.ts",
})
