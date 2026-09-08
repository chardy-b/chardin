import { cpus, platform, release, totalmem } from "node:os"
import { execFileSync } from "node:child_process"
import { expect, test } from "@playwright/test"
import { installWebGLProbe } from "./webgl-probe"
import { summarize } from "../../scripts/lib/measurement.mjs"
import budgets from "../../docs/performance-budgets.json"
import type {} from "../../src/engine/debug/test-api"

test("bounded fixed-workload release measurement", async ({
  page,
  browser,
}, info) => {
  const mobile = info.project.name === "mobile-emulation-low"
  const profile = mobile ? "low" : "high"
  const budget = budgets[mobile ? "mobile-emulation-low" : "desktop-high"]
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  // No telemetry or external requests are needed for this measurement.
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === "http://127.0.0.1:3000"
      ? route.continue()
      : route.abort(),
  )
  await page.addInitScript(installWebGLProbe)
  await page.goto("/?e2e=1")
  const enter = page.getByRole("button", { name: "Enter Chardin" })
  await expect(enter).toBeVisible({ timeout: 30_000 })
  // Navigation -> observed ready includes hydration, imports, model, SMAA and warmup;
  // excludes human gesture delay. Profile selection happens separately below.
  const startupMs = await page.evaluate(() => performance.now())
  const startupProfile = await page.evaluate(
    () => window.__CHARDIN_TEST__!.snapshot().quality,
  )
  await page
    .getByRole("combobox", { name: "Visual quality" })
    .selectOption(profile)
  await enter.click()
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-traveler-model",
    "loaded",
  )
  const measured = await page.evaluate(
    async ({ profile }) => {
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
      const start = performance.now()
      await new Promise<void>((resolve, reject) => {
        let frame = 0
        let previous = 0
        let raf = 0
        const deadline = setTimeout(() => {
          cancelAnimationFrame(raf)
          reject(new Error("Measurement exceeded 120 seconds"))
        }, 120_000)
        const tick = (time: number) => {
          try {
            if (document.hidden || gl.isContextLost())
              throw new Error("Measurement interrupted")
            const state = api.snapshot()
            if (!state.running || state.quality !== profile)
              throw new Error("Workload state changed")
            probe.resetFrame()
            const before = performance.now()
            // Same deterministic pole-crossing route in each fresh browser context.
            api.step(1, { move: { x: 0, y: 1 }, run: true })
            gl.finish()
            const completedFrameMs = performance.now() - before
            const counters = probe.snapshot()
            if (frame >= 60)
              raw.push({
                cadenceMs: time - previous,
                completedFrameMs,
                drawCalls: counters.drawCalls,
                triangles: counters.triangles,
                textureBytes: counters.textureBytes,
              })
            previous = time
            frame++
            if (frame === 360) {
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
      return {
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
    },
    { profile },
  )
  const report = {
    schema: 1,
    head: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty:
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim() !== "",
    recordedAt: new Date().toISOString(),
    classification:
      "Linux/SwiftShader browser measurement; mobile is emulation, never physical-device proof",
    host: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
      browser: browser.version(),
    },
    scenario: info.project.name,
    startupProfile,
    method:
      "60 warmup + 300 measured RAF frames; one fixed 1/60 run step + gl.finish per frame; no trimming or retries; completedFrameMs includes CPU submission and GPU wait, not presentation latency",
    ...measured,
    summary: {
      cadenceMs: summarize(
        measured.raw.map((frame) => frame.cadenceMs),
        budget.frameMs,
      ),
      completedFrameMs: summarize(
        measured.raw.map((frame) => frame.completedFrameMs),
        budget.frameMs,
      ),
      drawCalls: summarize(
        measured.raw.map((frame) => frame.drawCalls),
        budget.drawCalls,
        "max",
      ),
      triangles: summarize(
        measured.raw.map((frame) => frame.triangles),
        budget.triangles,
        "max",
      ),
      textureBytes: summarize(
        measured.raw.map((frame) => frame.textureBytes),
        budget.textureBytes,
        "max",
      ),
      peakTextureBytes: summarize(
        [measured.allocations.peakTextureBytes],
        budget.textureBytes,
        "max",
      ),
      startupMs: summarize([startupMs], budget.startupMs),
      loadedAssetBytes: summarize(
        [
          measured.resources
            .filter((resource) => resource.name.startsWith("/models/"))
            .reduce((sum, resource) => sum + resource.encodedBytes, 0),
        ],
        budgets.bundle.loadedAssetBytes,
      ),
      // A long interval is observed; compositor-dropped frames are not exposed here.
      longIntervals: measured.raw.filter(
        (frame) => frame.cadenceMs > budget.frameMs * 1.5,
      ).length,
    },
    errors,
  }
  await info.attach("performance.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  })
  expect(measured.raw).toHaveLength(300)
  expect(measured.allocations.unknownAllocations).toBe(0)
  expect(
    measured.raw.every(
      (frame) =>
        frame.drawCalls > 0 && frame.triangles > 0 && frame.textureBytes > 0,
    ),
  ).toBe(true)
  expect(errors).toEqual([])
  // Baseline collection reports failures without pretending these VM timings prove
  // hardware readiness. Strict mode also blocks missing reviewed cost budgets.
  if (process.env.CHARDIN_ENFORCE_BUDGETS === "true")
    for (const value of Object.values(report.summary))
      if (typeof value === "object") expect(value.status).toBe("pass")
})
