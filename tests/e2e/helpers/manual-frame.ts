import type { Page } from "@playwright/test"
import type { ControlIntent } from "@/engine/contracts"
import { finishWebGLFrame } from "./webgl"

/** Capture the genuine composited world and HTML viewport after the completed
 * manual frame crosses one presentation barrier, without stepping simulation. */
export async function captureManualFrame(page: Page) {
  await page.locator("canvas").evaluate(finishWebGLFrame, undefined, {
    timeout: 10_000,
  })
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  )
  return page.screenshot({
    animations: "allow",
    scale: "css",
    fullPage: false,
    timeout: 30_000,
  })
}

/** Compare world pixels independently of browser UI compositing and PNG
 * encoding. Render and read in one task: the default WebGL drawing buffer may
 * be discarded after presentation. Hash every RGBA byte without tolerance. */
export async function captureManualWorldFrame(
  page: Page,
  frames: number,
  intent: Partial<ControlIntent> = {},
) {
  return page.evaluate(
    async ({ frames, intent }) => {
      const api = window.__CHARDIN_TEST__
      const context = document.querySelector("canvas")?.getContext("webgl2")
      if (!api || !context) throw new Error("Manual WebGL world unavailable")
      api.step(frames, intent)
      context.finish()
      const width = context.drawingBufferWidth
      const height = context.drawingBufferHeight
      const pixels = new Uint8Array(width * height * 4)
      context.readPixels(
        0,
        0,
        width,
        height,
        context.RGBA,
        context.UNSIGNED_BYTE,
        pixels,
      )
      if (!pixels.some((value, index) => value !== pixels[index % 4]))
        throw new Error("Completed world frame contains no visual detail")
      const digest = await crypto.subtle.digest("SHA-256", pixels)
      return {
        width,
        height,
        sha256: Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
      }
    },
    { frames, intent },
  )
}
