import { createHash, webcrypto } from "node:crypto"
import { afterEach, expect, it, vi } from "vitest"
import type { Page } from "@playwright/test"
import {
  captureManualFrame,
  captureManualWorldFrame,
} from "../../e2e/helpers/manual-frame"
import { finishWebGLFrame } from "../../e2e/helpers/webgl"

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

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

function worldCapture(pixels: Uint8Array) {
  const calls: string[] = []
  const canvas = document.createElement("canvas")
  document.body.append(canvas)
  const context = {
    drawingBufferWidth: 2,
    drawingBufferHeight: 1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    finish: vi.fn(() => calls.push("finish")),
    readPixels: vi.fn(
      (_x, _y, _width, _height, _format, _type, destination: Uint8Array) => {
        calls.push("read")
        destination.set(pixels)
      },
    ),
  }
  vi.spyOn(canvas, "getContext").mockReturnValue(
    context as unknown as WebGL2RenderingContext,
  )
  const step = vi.fn(() => {
    calls.push("step")
    queueMicrotask(() => calls.push("presentation can discard buffer"))
  })
  vi.stubGlobal("__CHARDIN_TEST__", { step })
  vi.stubGlobal("crypto", webcrypto)
  const page = {
    evaluate: vi.fn((callback, args) => callback(args)),
    screenshot: vi.fn(),
  } as unknown as Page
  return { page, calls, context, step }
}

it("hashes every completed world pixel in the render task, independent of page screenshots", async () => {
  const pixels = new Uint8Array([12, 34, 56, 255, 78, 90, 12, 255])
  const { page, calls, context, step } = worldCapture(pixels)
  const first = await captureManualWorldFrame(page, 1)
  expect(first).toEqual({
    width: 2,
    height: 1,
    sha256: createHash("sha256").update(pixels).digest("hex"),
  })
  expect(calls).toEqual([
    "step",
    "finish",
    "read",
    "presentation can discard buffer",
  ])
  expect(context.readPixels).toHaveBeenCalledWith(
    0,
    0,
    2,
    1,
    context.RGBA,
    context.UNSIGNED_BYTE,
    pixels,
  )
  expect(await captureManualWorldFrame(page, 120)).toEqual(first)
  pixels[6] += 1
  const intent = { move: { x: 0, y: 1 } }
  const moved = await captureManualWorldFrame(page, 60, intent)
  expect(moved.sha256).not.toBe(first.sha256)
  expect(step.mock.calls).toEqual([
    [1, {}],
    [120, {}],
    [60, intent],
  ])
  expect(page.screenshot).not.toHaveBeenCalled()
})

it.each([0, 255])(
  "rejects a uniform/cleared framebuffer (%i) as movement evidence",
  async (value) => {
    const { page } = worldCapture(new Uint8Array(8).fill(value))
    await expect(captureManualWorldFrame(page, 1)).rejects.toThrow(
      "Completed world frame contains no visual detail",
    )
  },
)
