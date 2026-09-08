import { expect, it, vi } from "vitest"
import type { Page } from "@playwright/test"
import { captureManualFrame } from "../../e2e/helpers/manual-frame"
import { finishWebGLFrame } from "../../e2e/helpers/webgl"

it("finishes queued drawing before one page screenshot, without element stabilization", async () => {
  const calls: string[] = []
  const bytes = Buffer.from("frame")
  const evaluate = vi.fn(async () => {
    calls.push("finish")
  })
  const screenshot = vi.fn(async () => {
    calls.push("capture")
    return bytes
  })
  const elementScreenshot = vi.fn()
  const page = {
    locator: vi.fn(() => ({ evaluate, screenshot: elementScreenshot })),
    screenshot,
  } as unknown as Page
  expect(await captureManualFrame(page)).toBe(bytes)
  expect(calls).toEqual(["finish", "capture"])
  expect(evaluate).toHaveBeenCalledExactlyOnceWith(finishWebGLFrame)
  expect(screenshot).toHaveBeenCalledExactlyOnceWith({ animations: "disabled" })
  expect(elementScreenshot).not.toHaveBeenCalled()
})
