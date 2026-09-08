import type {} from "./webgl-probe"
import type {} from "../../src/engine/debug/test-api"

// Self-contained: Playwright serializes this function into the browser. Unit
// tests exercise this same loop with a fake RAF clock and WebGL context.
export async function measureWorkload({
  profile,
  warmupFrames,
  sampleFrames,
  timeoutMs,
  stationary = false,
}: {
  profile: "high" | "low"
  warmupFrames: number
  sampleFrames: number
  timeoutMs: number
  stationary?: boolean
}) {
  const api = window.__CHARDIN_TEST__!
  const probe = window.__CHARDIN_PROBE__
  const gl = document.querySelector("canvas")!.getContext("webgl2")!
  const debug = gl.getExtension("WEBGL_debug_renderer_info")
  const environment = {
    userAgent: navigator.userAgent,
    renderer: debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER),
    vendor: debug
      ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR),
    dpr: devicePixelRatio,
    drawingBuffer: {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    },
    viewport: { width: innerWidth, height: innerHeight },
    initialState: api.snapshot(),
  }
  const raw: Array<{
    cadenceMs: number
    completedFrameMs: number
    drawCalls: number
    triangles: number
    textureBytes: number
  }> = []
  let completedFrames = 0
  let lastProgressMs = 0
  let failure: string | null = null
  const start = performance.now()
  try {
    await new Promise<void>((resolve, reject) => {
      let previous = 0
      let raf = 0
      const elapsed = () => performance.now() - start
      const timeoutError = () =>
        new Error(
          `Measurement exceeded ${timeoutMs} ms: ${completedFrames}/${warmupFrames + sampleFrames} completed frames, ${raw.length}/${sampleFrames} samples; last progress at ${lastProgressMs} ms`,
        )
      const deadline = setTimeout(() => {
        cancelAnimationFrame(raf)
        reject(timeoutError())
      }, timeoutMs)
      const tick = (time: number) => {
        try {
          if (elapsed() >= timeoutMs) throw timeoutError()
          if (document.hidden || gl.isContextLost())
            throw new Error("Measurement interrupted")
          const state = api.snapshot()
          if (!state.running || state.quality !== profile)
            throw new Error("Workload state changed")
          probe.resetFrame()
          const before = performance.now()
          // Same deterministic pole-crossing route in each fresh browser context.
          if (stationary) api.step(1)
          else api.step(1, { move: { x: 0, y: 1 }, run: true })
          gl.finish()
          const completedFrameMs = performance.now() - before
          const counters = probe.snapshot()
          if (completedFrames >= warmupFrames)
            raw.push({
              cadenceMs: time - previous,
              completedFrameMs,
              drawCalls: counters.drawCalls,
              triangles: counters.triangles,
              textureBytes: counters.textureBytes,
            })
          previous = time
          completedFrames++
          lastProgressMs = elapsed()
          // Timers cannot interrupt a synchronous draw/finish. Do not accept a final
          // frame that crosses the deadline before the timer can run.
          if (lastProgressMs >= timeoutMs) throw timeoutError()
          const after = api.snapshot()
          if (!after.running || after.quality !== profile)
            throw new Error("Workload state changed")
          if (completedFrames === warmupFrames + sampleFrames) {
            clearTimeout(deadline)
            resolve()
          } else raf = requestAnimationFrame(tick)
        } catch (error) {
          clearTimeout(deadline)
          reject(error)
        }
      }
      raf = requestAnimationFrame(tick)
    })
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  return {
    failure,
    progress: { completedFrames, lastProgressMs },
    environment,
    raw,
    durationMs: performance.now() - start,
    allocations: probe.snapshot(),
    finalState: api.snapshot(),
    resources: performance.getEntriesByType("resource").map((entry) => {
      const resource = entry as PerformanceResourceTiming
      return {
        name: new URL(resource.name).pathname,
        encodedBytes: resource.encodedBodySize,
        decodedBytes: resource.decodedBodySize,
        transferBytes: resource.transferSize,
      }
    }),
  }
}
