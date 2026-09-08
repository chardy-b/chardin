import { expect, test } from "@playwright/test"
import { finishWebGLFrame, retainContextLossControl } from "./helpers/webgl"
import type { ChardinTestApi } from "../../src/engine/debug/test-api"

declare global {
  interface Window {
    __CHARDIN_TEST__?: ChardinTestApi
  }
}

test("deterministic spawn and travel have real screenshot baselines", async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/?e2e=1")
  await page.getByRole("button", { name: "Enter Chardin" }).click()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-traveler-model",
    "loaded",
  )
  // WIL-125 intentionally changes the visible pavilion and Light/view UI.
  // Keep exact comparisons: controller-reviewed replacements are required
  // after the production regressions pass (docs/design/wil125-validation.md).
  await expect(page).toHaveScreenshot("spawn.png")
  const before = await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())
  await page.evaluate(() =>
    window.__CHARDIN_TEST__!.step(180, { move: { x: 0, y: 1 } }),
  )
  const moved = await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())
  expect(moved.distance).toBeGreaterThan(4)
  expect(moved.position).not.toEqual(before.position)
  expect(moved.grounded).toBe(true)
  const radius = Math.hypot(...moved.position)
  expect(
    moved.cameraUp.reduce(
      (sum, value, i) => sum + (value * moved.position[i]) / radius,
      0,
    ),
  ).toBeCloseTo(1, 6)
  await expect(page).toHaveScreenshot("traveled.png")
  await page
    .getByLabel("Experience controls")
    .getByRole("button", { name: "Pause", exact: true })
    .click()
  await page.evaluate(() =>
    window.__CHARDIN_TEST__!.step(60, { jumpPressed: true }),
  )
  expect(
    await page.evaluate(
      () => window.__CHARDIN_TEST__!.snapshot().simulationTime,
    ),
  ).toBe(moved.simulationTime)
  await page.getByRole("button", { name: "Resume" }).click()
  const frames: number[][] = []
  for (let i = 0; i < 24; i++) {
    await page.evaluate(() =>
      window.__CHARDIN_TEST__!.step(30, { move: { x: 0, y: 1 }, run: true }),
    )
    frames.push(
      await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot().cameraUp),
    )
  }
  for (let i = 1; i < frames.length; i++) {
    expect(frames[i].every(Number.isFinite)).toBe(true)
    expect(
      frames[i].reduce((sum, value, j) => sum + value * frames[i - 1][j], 0),
    ).toBeGreaterThan(0.9)
  }
  if (testInfo.project.name === "chromium") {
    await page.setViewportSize({ width: 820, height: 1180 })
    await expect
      .poll(() =>
        page.evaluate(() => window.__CHARDIN_TEST__!.snapshot().viewport),
      )
      .toEqual({ width: 820, height: 1180 })
    await page.locator("canvas").evaluate(finishWebGLFrame)
    const tablet = await page.screenshot({ animations: "disabled" })
    expect(tablet).toMatchSnapshot("tablet.png", {
      threshold: 0,
      maxDiffPixels: 0,
    })
  }
  await testInfo.attach("runtime-environment", {
    body: JSON.stringify({
      project: testInfo.project.name,
      note: "Chromium on Linux VM; device emulation, not physical-device performance",
      startupContentMs: before.startupContentMs,
    }),
    contentType: "application/json",
  })
  expect(errors).toEqual([])
})

test("depth and normal signals independently affect real WebGL pixels", async ({
  page,
}) => {
  await page.goto("/?e2e=1")
  await page.getByRole("button", { name: "Enter Chardin" }).click()
  const canvas = page.locator("canvas")
  await page.evaluate(() =>
    window.__CHARDIN_TEST__!.outlineSignals(false, false),
  )
  const plain = await canvas.screenshot()
  await page.evaluate(() =>
    window.__CHARDIN_TEST__!.outlineSignals(true, false),
  )
  expect((await canvas.screenshot()).equals(plain)).toBe(false)
  await page.evaluate(() =>
    window.__CHARDIN_TEST__!.outlineSignals(false, true),
  )
  expect((await canvas.screenshot()).equals(plain)).toBe(false)
})

test("quality and live motion changes preserve simulation and bounded resources", async ({
  page,
}) => {
  await page.goto("/?e2e=1")
  await page.getByRole("button", { name: "Enter Chardin" }).click()
  const before = await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())
  for (let i = 0; i < 2; i++) {
    for (const quality of ["high", "balanced", "low"]) {
      await page
        .getByRole("combobox", { name: "Visual quality" })
        .selectOption(quality)
      await expect(page.locator("canvas")).toHaveAttribute(
        "data-quality",
        quality,
      )
      const state = await page.evaluate(() =>
        window.__CHARDIN_TEST__!.snapshot(),
      )
      expect(state.position).toEqual(before.position)
      expect(state.motorRadius).toBe(before.motorRadius)
      expect(state.geometryCount).toBeLessThanOrEqual(before.geometryCount + 2)
      expect(state.textureCount).toBeLessThanOrEqual(before.textureCount + 2)
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" })
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  )
  await page.evaluate(() =>
    window.__CHARDIN_TEST__!.step(30, {
      move: { x: 0, y: 1 },
      jumpPressed: true,
    }),
  )
  expect(
    (await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())).distance,
  ).toBeGreaterThan(0)
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          media: matchMedia("(prefers-reduced-motion: reduce)").matches,
          canvas: document.querySelector("canvas")?.dataset.reducedMotion,
          engine: window.__CHARDIN_TEST__!.snapshot().reducedMotion,
        })),
      { timeout: 15_000 },
    )
    .toEqual({ media: false, canvas: "false", engine: false })
})

test("real context loss rebuilds resources and waits for a resume gesture", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/?e2e=1")
  await page.getByRole("button", { name: "Enter Chardin" }).click()
  for (let attempt = 0; attempt < 2; attempt++) {
    const lossControl = await page
      .locator("canvas")
      .evaluateHandle(retainContextLossControl)
    try {
      await lossControl.evaluate((control) => control.lose())
      await expect(
        page.getByRole("heading", { name: "Graphics interrupted" }),
      ).toBeVisible()
      await page.getByRole("button", { name: "Retry" }).click()
      await expect(
        page.getByRole("heading", { name: "Graphics interrupted" }),
      ).toBeVisible()
      await lossControl.evaluate((control) => control.restore())
    } finally {
      await lossControl.dispose()
    }
    await expect(
      page.getByRole("heading", { name: "Graphics recovered" }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot().running),
    ).toBe(false)
    await page.getByRole("button", { name: "Resume" }).click()
    await page.evaluate(() =>
      window.__CHARDIN_TEST__!.step(60, { move: { x: 0, y: 1 } }),
    )
    expect(
      await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot().distance),
    ).toBeGreaterThan(1)
  }
  expect(errors).toEqual([])
})

test("a real draw failure offers retry without silently resuming", async ({
  page,
}) => {
  await page.goto("/?e2e=1")
  await page.getByRole("button", { name: "Enter Chardin" }).click()
  await page.evaluate(() => {
    const gl = document.querySelector("canvas")!.getContext("webgl2")!
    const original = gl.drawElements.bind(gl)
    gl.drawElements = () => {
      gl.drawElements = original
      throw new Error("test driver failure")
    }
    window.__CHARDIN_TEST__!.step(1)
  })
  await expect(
    page.getByRole("heading", { name: "Chardin could not open." }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => Object.hasOwn(window, "__CHARDIN_TEST__")),
  ).toBe(false)
  await page.getByRole("button", { name: "Retry" }).click()
  await expect(
    page.getByRole("button", { name: "Enter Chardin" }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot().running),
  ).toBe(false)
  await page.getByRole("button", { name: "Enter Chardin" }).click()
  await page.evaluate(() =>
    window.__CHARDIN_TEST__!.step(60, { move: { x: 0, y: 1 } }),
  )
  expect(
    await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot().distance),
  ).toBeGreaterThan(1)
})

test("loading waits for the actual traveler request to settle", async ({
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/models/traveler.glb", async (route) => {
    await gate
    await route.continue()
  })
  await page.goto("/?e2e=1")
  await expect(
    page.getByRole("progressbar", { name: "Preparing the world" }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Enter Chardin" })).toHaveCount(
    0,
  )
  release()
  await expect(
    page.getByRole("button", { name: "Enter Chardin" }),
  ).toBeVisible()
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-traveler-model",
    "loaded",
  )
})
