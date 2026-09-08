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

function manualCapture() {
  const calls: string[] = []
  const canvas = document.createElement("canvas")
  document.body.append(canvas)
  const finish = vi.fn(() => calls.push("finish"))
  vi.spyOn(canvas, "getContext").mockReturnValue({
    finish,
  } as unknown as WebGL2RenderingContext)
  const evaluate = vi.fn(async (callback: typeof finishWebGLFrame) => {
    callback(canvas)
  })
  const step = vi.fn()
  vi.stubGlobal("__CHARDIN_TEST__", { step })
  const raf = vi.fn((callback: FrameRequestCallback) => {
    calls.push("presentation")
    callback(0)
    return 1
  })
  vi.stubGlobal("requestAnimationFrame", raf)
  // Opaque mocked screenshot output; never used as review evidence.
  const bytes = Buffer.from("mock page screenshot")
  const page = {
    locator: vi.fn(() => ({ evaluate })),
    evaluate: vi.fn(async (callback: () => Promise<void>) => callback()),
    screenshot: vi.fn(async () => {
      calls.push("screenshot")
      return bytes
    }),
  }
  const capture = () => captureManualFrame(page as unknown as Page)
  return { page, calls, evaluate, step, raf, bytes, capture }
}

it("awaits finish -> one presentation barrier -> full viewport screenshot without simulation", async () => {
  const { page, calls, evaluate, step, raf, bytes, capture } = manualCapture()
  let present!: FrameRequestCallback
  const requested = new Promise<void>((resolve) => {
    raf.mockImplementationOnce((callback) => {
      present = callback
      resolve()
      return 1
    })
  })
  const result = capture()
  await requested
  expect(calls).toEqual(["finish"])
  expect(page.screenshot).not.toHaveBeenCalled()
  calls.push("presentation")
  present(0)
  expect(await result).toBe(bytes)
  expect(calls).toEqual(["finish", "presentation", "screenshot"])
  expect(page.locator).toHaveBeenCalledExactlyOnceWith("canvas")
  expect(evaluate).toHaveBeenCalledExactlyOnceWith(
    finishWebGLFrame,
    undefined,
    { timeout: 10_000 },
  )
  expect(page.evaluate).toHaveBeenCalledOnce()
  expect(raf).toHaveBeenCalledOnce()
  expect(page.screenshot).toHaveBeenCalledExactlyOnceWith({
    animations: "allow",
    scale: "css",
    fullPage: false,
    timeout: 30_000,
  })
  expect(step).not.toHaveBeenCalled()
})

it.each(["finish", "presentation", "screenshot"] as const)(
  "propagates %s failure without continuing or retrying",
  async (stage) => {
    const { page, evaluate, step, capture } = manualCapture()
    const error = new Error(`${stage} failed`)
    const operation = {
      finish: evaluate,
      presentation: page.evaluate,
      screenshot: page.screenshot,
    }[stage]
    operation.mockRejectedValueOnce(error)
    await expect(capture()).rejects.toBe(error)
    expect(evaluate).toHaveBeenCalledOnce()
    expect(page.evaluate).toHaveBeenCalledTimes(stage === "finish" ? 0 : 1)
    expect(page.screenshot).toHaveBeenCalledTimes(
      stage === "screenshot" ? 1 : 0,
    )
    expect(step).not.toHaveBeenCalled()
  },
)

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
