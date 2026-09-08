import type { Page } from "@playwright/test"
import { finishWebGLFrame } from "./webgl"

/** Capture one completed manual-mode frame without element stability polling. */
export async function captureManualFrame(page: Page) {
  await page.locator("canvas").evaluate(finishWebGLFrame)
  return page.screenshot({ animations: "disabled" })
}
