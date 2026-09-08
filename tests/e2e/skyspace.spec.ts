import { expect, test } from "@playwright/test"
import { walkToSkyspacePoint } from "./helpers/skyspace-route"

// Constrained SwiftShader context startup exceeded 30s before the test body.
// Set the test/fixture budget during collection so context setup receives it.
test.describe.configure({ timeout: 60_000, retries: 0 })

test("pavilion round trip, visitor-started score, eye view and recovery", async ({
  page,
}, info) => {
  await page.goto("/?e2e=1")
  await page.getByRole("button", { name: "Enter Chardin" }).click()
  const initial = await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())
  const canvas = await page.locator("canvas").elementHandle()
  const traces = []
  for (const point of [0, 1, 2, 3, 4])
    traces.push(await page.evaluate(walkToSkyspacePoint, { point }))
  await page.locator(".sky-panel summary").click()
  await page
    .getByRole("button", { name: "Start light sequence", exact: true })
    .click()
  await page.evaluate(() => window.__CHARDIN_TEST__!.step(60))
  expect(
    (await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())).sky.tick,
  ).toBe(60)
  await page.getByRole("button", { name: "View aperture", exact: true }).click()
  const viewed = await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())
  expect(viewed.cameraMode).toBe("view")
  await page.evaluate(() =>
    window.__CHARDIN_TEST__!.step(60, {
      move: { x: 0, y: 1 },
      jumpPressed: true,
    }),
  )
  expect(
    (await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())).position,
  ).toEqual(viewed.position)
  await page.getByRole("button", { name: "Leave view", exact: true }).click()
  for (const point of [3, 2, 1, 0])
    traces.push(
      await page.evaluate(walkToSkyspacePoint, { point, backward: true }),
    )
  const left = await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())
  expect(left.sky.playback).toBe("paused")
  expect(left.generation).toBe(initial.generation)
  expect(
    await canvas!.evaluate((node) => node === document.querySelector("canvas")),
  ).toBe(true)
  expect(new URL(page.url()).pathname).toBe("/")
  await info.attach("pavilion-route.json", {
    body: JSON.stringify(traces, null, 2),
    contentType: "application/json",
  })
})

test("pavilion unavailable discloses failure without losing HTML content", async ({
  page,
}) => {
  await page.goto("/?e2e=1&landmarkFailure=1")
  await page.getByRole("button", { name: "Enter Chardin" }).click()
  await page.locator(".sky-panel summary").click()
  await expect(page.locator(".sky-panel")).toContainText(
    "The pavilion is unavailable. You can still explore the planet.",
  )
  await page
    .getByRole("button", { name: "About the pavilion", exact: true })
    .click()
  await expect(
    page.getByRole("region", { name: "About the pavilion" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Next still phase" }).click()
  await expect(
    page.getByRole("heading", { name: "Warm surround" }),
  ).toBeVisible()
  expect(
    (await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot())).sky.tick,
  ).toBe(0)
})

test("the complete HTML pavilion remains available without WebGL2", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type,
      ...args
    ) {
      if (type === "webgl2") return null
      return original.apply(this, [type, ...args] as Parameters<
        typeof original
      >)
    } as typeof original
  })
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Chardin needs WebGL2 to open." }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "About the pavilion", exact: true })
    .click()
  for (const name of [
    "Settle",
    "Warm surround",
    "Open blue",
    "Cool surround",
    "Return",
  ]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
    if (name !== "Return")
      await page.getByRole("button", { name: "Next still phase" }).click()
  }
})
