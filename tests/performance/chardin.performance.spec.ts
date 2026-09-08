import { cpus, platform, release, totalmem } from "node:os"
import { execFileSync } from "node:child_process"
import { expect, test } from "@playwright/test"
import { installWebGLProbe } from "./webgl-probe"
import { summarize } from "../../scripts/lib/measurement.mjs"
import { loadPerformanceBudgets } from "../../scripts/lib/performance-budgets.mjs"
import { measureWorkload } from "./measure-workload"
import {
  PERFORMANCE_WORKLOAD,
  PERFORMANCE_TIMEOUTS,
} from "../../scripts/lib/performance-workload.mjs"

const budgets = loadPerformanceBudgets()

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
  const workload = {
    ...PERFORMANCE_WORKLOAD,
    timeoutMs:
      PERFORMANCE_TIMEOUTS.samplingMs[
        info.project.name as keyof typeof PERFORMANCE_TIMEOUTS.samplingMs
      ],
  }
  const measured = await page.evaluate(measureWorkload, {
    profile,
    ...workload,
  } as const)
  const metadata = {
    schema: 2,
    head: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty:
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim() !== "",
    recordedAt: new Date().toISOString(),
    scenario: info.project.name,
    workload,
    classification:
      "Chromium/SwiftShader software-renderer measurement; mobile is emulation, never hardware or physical-device proof",
    host: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
      browser: browser.version(),
    },
    startupProfile,
    ...measured,
    errors,
  }
  if (measured.failure) {
    // Partial samples are diagnostic only: never summarize an incomplete route.
    await info.attach("performance-incomplete.json", {
      body: JSON.stringify({ ...metadata, status: "incomplete" }, null, 2),
      contentType: "application/json",
    })
    throw new Error(measured.failure)
  }
  const report = {
    ...metadata,
    method:
      "60 warmup + 300 measured RAF frames; one fixed 1/60 run step + gl.finish per frame; no trimming or retries; completedFrameMs includes CPU submission and GPU wait, not presentation latency",
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
  }
  await info.attach("performance.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  })
  expect(measured.raw).toHaveLength(PERFORMANCE_WORKLOAD.sampleFrames)
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
