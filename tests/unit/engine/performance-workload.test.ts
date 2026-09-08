import { readFileSync } from "node:fs"
import { afterEach, expect, it, vi } from "vitest"
import {
  PERFORMANCE_TIMEOUTS,
  PERFORMANCE_WORKLOAD,
} from "../../../scripts/lib/performance-workload.mjs"
import { measureWorkload } from "../../performance/measure-workload"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

function fixture(profile: "high" | "low" = "high") {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  let now = 0
  let serviceMs = 2
  let scheduled: FrameRequestCallback | undefined
  const state = { running: true, quality: profile }
  const calls: string[] = []
  const step = vi.fn(() => calls.push("step"))
  const finish = vi.fn(() => {
    now += serviceMs
    calls.push("finish")
  })
  const gl = {
    getExtension: () => null,
    getParameter: () => "fake WebGL for unit tests",
    isContextLost: vi.fn(() => false),
    finish,
    drawingBufferWidth: 1280,
    drawingBufferHeight: 720,
  }
  vi.stubGlobal("__CHARDIN_TEST__", { snapshot: () => ({ ...state }), step })
  vi.stubGlobal("__CHARDIN_PROBE__", {
    resetFrame: vi.fn(() => calls.push("reset")),
    snapshot: () => ({
      drawCalls: 48,
      triangles: 5786,
      textureBytes: 100,
      peakTextureBytes: 200,
      unknownAllocations: 0,
    }),
  })
  vi.stubGlobal("performance", { now: () => now, getEntriesByType: () => [] })
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    scheduled = callback
    return 1
  })
  vi.stubGlobal("cancelAnimationFrame", () => {
    scheduled = undefined
  })
  vi.spyOn(document, "hidden", "get").mockReturnValue(false)
  const canvas = document.createElement("canvas")
  document.body.append(canvas)
  vi.spyOn(canvas, "getContext").mockReturnValue(
    gl as unknown as WebGL2RenderingContext,
  )
  return {
    state,
    gl,
    calls,
    step,
    finish,
    tick(delayMs = 16, costMs = 2) {
      if (!scheduled) return false
      now += delayMs
      serviceMs = costMs
      const callback = scheduled
      scheduled = undefined
      callback(now)
      return true
    },
    collect() {
      return measureWorkload({
        profile,
        ...PERFORMANCE_WORKLOAD,
        timeoutMs:
          PERFORMANCE_TIMEOUTS.samplingMs[
            profile === "high" ? "desktop-high" : "mobile-emulation-low"
          ],
      })
    },
  }
}

it.each(["high", "low"] as const)(
  "retains the identical 360-step route and all 300 samples for %s",
  async (profile) => {
    const f = fixture(profile)
    const result = f.collect()
    for (let frame = 0; frame < 360; frame++) {
      // A measured stall is retained in both timing series, never filtered out.
      expect(f.tick(frame === 100 ? 1000 : 16, frame === 100 ? 500 : 2)).toBe(
        true,
      )
    }
    const measured = await result
    expect(measured.failure).toBeNull()
    expect(measured.progress.completedFrames).toBe(360)
    expect(measured.raw).toHaveLength(300)
    expect(measured.raw[40]).toMatchObject({
      cadenceMs: 1002,
      completedFrameMs: 500,
    })
    expect(f.step.mock.calls).toEqual(
      Array.from({ length: 360 }, () => [
        1,
        { move: { x: 0, y: 1 }, run: true },
      ]),
    )
    expect(f.calls).toEqual(
      Array.from({ length: 360 }, () => ["reset", "step", "finish"]).flat(),
    )
    expect(f.tick()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  },
)

it("allows a slow fixed High workload past the old deadline without adapting its samples", async () => {
  const f = fixture()
  const result = f.collect()
  for (let frame = 0; frame < 360; frame++) f.tick(16, 600)
  const measured = await result
  expect(measured.failure).toBeNull()
  expect(measured.durationMs).toBe(221760)
  expect(measured.raw).toHaveLength(300)
})

it.each(["high", "low"] as const)(
  "fails and cancels a stalled RAF for %s, retaining partial diagnostics",
  async (profile) => {
    const f = fixture(profile)
    const result = f.collect()
    for (let frame = 0; frame < 65; frame++) f.tick()
    vi.advanceTimersByTime(
      PERFORMANCE_TIMEOUTS.samplingMs[
        profile === "high" ? "desktop-high" : "mobile-emulation-low"
      ],
    )
    const measured = await result
    expect(measured.failure).toContain("65/360 completed frames, 5/300 samples")
    expect(measured.progress).toEqual({
      completedFrames: 65,
      lastProgressMs: 1170,
    })
    expect(measured.raw).toHaveLength(5)
    expect(f.tick()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  },
)

it("rejects a final synchronous frame crossing the deadline before timers can fire", async () => {
  const f = fixture()
  const result = f.collect()
  for (let frame = 0; frame < 359; frame++) f.tick()
  f.tick(16, 300_000)
  const measured = await result
  expect(measured.failure).toContain("Measurement exceeded 300000 ms")
  expect(measured.raw).toHaveLength(300)
  expect(f.tick()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it("rejects a RAF callback delivered at the deadline without submitting more work", async () => {
  const f = fixture()
  const result = f.collect()
  f.tick(300_000)
  expect((await result).failure).toContain("0/360 completed frames")
  expect(f.step).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it("rejects a workload that stops during the final render", async () => {
  const f = fixture()
  const result = f.collect()
  for (let frame = 0; frame < 359; frame++) f.tick()
  f.finish.mockImplementationOnce(() => {
    f.state.running = false
  })
  f.tick()
  expect((await result).failure).toBe("Workload state changed")
  expect(vi.getTimerCount()).toBe(0)
})

it.each(["hidden", "context", "paused", "quality"])(
  "fails closed on %s interruption",
  async (interruption) => {
    const f = fixture()
    const result = f.collect()
    if (interruption === "hidden")
      vi.spyOn(document, "hidden", "get").mockReturnValue(true)
    if (interruption === "context") f.gl.isContextLost.mockReturnValue(true)
    if (interruption === "paused") f.state.running = false
    if (interruption === "quality") f.state.quality = "low"
    f.tick()
    expect((await result).failure).toMatch(
      /Measurement interrupted|Workload state changed/,
    )
    expect(f.step).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  },
)

it("keeps fixed timeout layers inside the CI job with no retry or workload override", () => {
  expect(PERFORMANCE_WORKLOAD).toEqual({ warmupFrames: 60, sampleFrames: 300 })
  expect(Object.isFrozen(PERFORMANCE_WORKLOAD)).toBe(true)
  expect(PERFORMANCE_TIMEOUTS.samplingMs).toEqual({
    "desktop-high": 300_000,
    "mobile-emulation-low": 120_000,
  })
  const testMs = Object.values(PERFORMANCE_TIMEOUTS.samplingMs).reduce(
    (sum, ms) => sum + ms + PERFORMANCE_TIMEOUTS.testOverheadMs,
    0,
  )
  expect(testMs + PERFORMANCE_TIMEOUTS.webServerMs + 60_000).toBe(
    PERFORMANCE_TIMEOUTS.globalMs,
  )
  expect(PERFORMANCE_TIMEOUTS.globalMs + 60_000).toBe(
    PERFORMANCE_TIMEOUTS.runnerMs,
  )
  const read = (path: string) => readFileSync(path, "utf8")
  const config = read("playwright.performance.config.ts")
  expect(config).toContain("workers: 1")
  expect(config).toContain("retries: 0")
  expect(config).toContain("globalTimeout: PERFORMANCE_TIMEOUTS.globalMs")
  expect(config).toContain("timeout: PERFORMANCE_TIMEOUTS.webServerMs")
  expect(config).toContain("viewport: { width: 1280, height: 720 }")
  expect(config).toContain('devices["Pixel 5"]')
  expect(config).not.toContain("process.env")
  expect(read("scripts/release-evidence.mjs")).toContain(
    'gate === "performance" ? PERFORMANCE_TIMEOUTS.runnerMs',
  )
  expect(read(".github/workflows/quality.yml")).toContain("timeout-minutes: 20")
  expect(PERFORMANCE_TIMEOUTS.runnerMs + 5000).toBeLessThan(
    20 * 60_000 - 6 * 60_000,
  )
})

it("samples an explicitly positioned pavilion scene without changing the Wave 1 traversal workload", async () => {
  const f = fixture()
  const result = measureWorkload({
    profile: "high",
    ...PERFORMANCE_WORKLOAD,
    timeoutMs: 300000,
    stationary: true,
  })
  for (let i = 0; i < 360; i++) f.tick()
  expect((await result).raw).toHaveLength(300)
  expect(f.step.mock.calls).toEqual(Array.from({ length: 360 }, () => [1]))
})
