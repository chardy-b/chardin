import { expect, test } from "@playwright/test"
import { walkToSkyspacePoint } from "./helpers/skyspace-route"
import { captureManualFrame } from "./helpers/manual-frame"

// Fourteen sequential captures at 30s each, plus 60s for setup, traversal and
// finish/presentation barriers. The original 30s test budget expired mid-capture.
// Collection-time metadata also covers constrained SwiftShader fixture setup.
test.describe.configure({ timeout: 480_000, retries: 0 })

// First implementation captures are review candidates, not fabricated approved
// baselines. The controller must inspect them before committing any baseline.
test("pavilion authored views and score endpoints for visual review", async ({
  page,
}, info) => {
  await page.goto("/?e2e=1")
  await page.getByRole("button", { name: "Enter Chardin" }).click()
  for (const point of [0, 1, 2, 3, 4]) {
    await page.evaluate(walkToSkyspacePoint, {
      point,
      facePoint: point === 0 ? 1 : undefined,
    })
    const state = await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())
    expect(state.cameraMode).not.toBe("blocked")
    if (point >= 3) expect(state.travelerVisible).toBe(false)
    if ([0, 3, 4].includes(point))
      await info.attach(`pavilion-P${point}.png`, {
        body: await captureManualFrame(page),
        contentType: "image/png",
      })
  }
  await page.locator(".sky-panel summary").click()
  await page.getByRole("button", { name: "View aperture", exact: true }).click()
  await page.locator(".sky-panel summary").click()
  // Advance the real fixed camera transition before score endpoint captures.
  await page.evaluate(() => window.__CHARDIN_TEST__!.step(90))
  for (const tick of [
    0, 1800, 3150, 4500, 5400, 6300, 7200, 8100, 9450, 10800,
  ]) {
    await page.evaluate((t) => window.__CHARDIN_TEST__!.setSkyTick(t), tick)
    expect(
      (await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot()))
        .travelerVisible,
    ).toBe(false)
    await info.attach(`aperture-${tick}.png`, {
      body: await captureManualFrame(page),
      contentType: "image/png",
    })
  }
  expect(
    (await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())).cameraMode,
  ).toBe("view")
  await info.attach("view-state.json", {
    body: JSON.stringify(
      await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot()),
      null,
      2,
    ),
    contentType: "application/json",
  })
  await page.locator(".sky-panel summary").click()
  await page.getByRole("button", { name: "Leave view", exact: true }).click()
  await page.locator(".sky-panel summary").click()
  for (const point of [3, 2, 1, 0])
    await page.evaluate(walkToSkyspacePoint, { point, backward: true })
  expect(
    (await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot()))
      .travelerVisible,
  ).toBe(true)
  await info.attach("pavilion-exit.png", {
    body: await captureManualFrame(page),
    contentType: "image/png",
  })
})
