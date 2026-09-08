import { expect, test } from "@playwright/test"
import { identity } from "../../scripts/lib/evidence.mjs"
import { summarize } from "../../scripts/lib/measurement.mjs"
import {
  PERFORMANCE_WORKLOAD,
  PERFORMANCE_TIMEOUTS,
} from "../../scripts/lib/performance-workload.mjs"
import { walkToSkyspacePoint } from "../e2e/helpers/skyspace-route"
import { installWebGLProbe } from "./webgl-probe"
import { measureWorkload } from "./measure-workload"

// Collect each scene/project in isolation; the unchanged Wave 1 global timeout
// is not an eight-scene budget. See the WIL-125 controller handoff ledger.
for (const scene of ["approach", "threshold", "chamber", "exit"] as const)
  test(`pavilion whole-frame ${scene}`, async ({ page, browser }, info) => {
    const profile =
      info.project.name === "mobile-emulation-low" ? "low" : "high"
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === "http://127.0.0.1:3000"
        ? route.continue()
        : route.abort(),
    )
    await page.addInitScript(installWebGLProbe)
    await page.goto("/?e2e=1")
    await page
      .getByRole("button", { name: "Enter Chardin" })
      .waitFor({ timeout: 30000 })
    const startupMs = await page.evaluate(() => performance.now())
    await page
      .getByRole("combobox", { name: "Visual quality" })
      .selectOption(profile)
    await page.getByRole("button", { name: "Enter Chardin" }).click()
    const end = scene === "approach" ? 0 : scene === "threshold" ? 3 : 4
    for (let point = 0; point <= end; point++)
      await page.evaluate(walkToSkyspacePoint, { point })
    if (scene === "exit")
      for (const point of [3, 2, 1, 0])
        await page.evaluate(walkToSkyspacePoint, { point, backward: true })
    await page.evaluate(() => window.__CHARDIN_TEST__!.setSkyTick(4500))
    const measured = await page.evaluate(measureWorkload, {
      profile,
      ...PERFORMANCE_WORKLOAD,
      stationary: true,
      timeoutMs:
        PERFORMANCE_TIMEOUTS.samplingMs[
          info.project.name as keyof typeof PERFORMANCE_TIMEOUTS.samplingMs
        ],
    } as const)
    const target = profile === "high" ? 1000 / 60 : 1000 / 30
    await info.attach(`pavilion-${scene}.json`, {
      body: JSON.stringify(
        {
          ...identity(),
          recordedAt: new Date().toISOString(),
          scene,
          browser: browser.version(),
          classification:
            "Browser collection; device identity and physical hardware status require controller review",
          startupMs,
          workload: { ...PERFORMANCE_WORKLOAD, stationary: true },
          ...measured,
          errors,
          summary: {
            cadenceMs: summarize(
              measured.raw.map((f) => f.cadenceMs),
              target,
            ),
            completedFrameMs: summarize(
              measured.raw.map((f) => f.completedFrameMs),
              target,
            ),
            drawCalls: summarize(
              measured.raw.map((f) => f.drawCalls),
              null,
              "max",
            ),
            triangles: summarize(
              measured.raw.map((f) => f.triangles),
              null,
              "max",
            ),
            textureBytes: summarize(
              measured.raw.map((f) => f.textureBytes),
              null,
              "max",
            ),
            longIntervals: measured.raw.filter(
              (f) => f.cadenceMs > target * 1.5,
            ).length,
          },
        },
        null,
        2,
      ),
      contentType: "application/json",
    })
    expect(measured.failure).toBeNull()
    expect(measured.raw).toHaveLength(300)
    expect(measured.allocations.unknownAllocations).toBe(0)
    expect(errors).toEqual([])
  })
