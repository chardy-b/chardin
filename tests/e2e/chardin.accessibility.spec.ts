import { expect, test, type Locator, type Page } from "@playwright/test"
import { captureManualFrame } from "./helpers/manual-frame"

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab")
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      await expect(target).toBeFocused()
      const focus = await target.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          width: parseFloat(style.outlineWidth),
          style: style.outlineStyle,
        }
      })
      expect(focus.width).toBeGreaterThanOrEqual(2)
      expect(focus.style).not.toBe("none")
      return
    }
  }
  throw new Error("Control was not keyboard reachable in 30 Tabs")
}

async function targets(page: Page) {
  const result = []
  for (const control of await page
    .locator(
      "button:visible, select:visible, a:visible, [data-touch-input]:visible",
    )
    .all()) {
    const bounds = await control.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeGreaterThanOrEqual(44)
    expect(bounds!.height).toBeGreaterThanOrEqual(44)
    result.push({
      name:
        (await control.getAttribute("aria-label")) ??
        (await control.textContent()),
      ...bounds,
    })
  }
  return result
}

test("keyboard-only entry, quality, guide, pause and resume retain visible focus", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "chromium")
  await page.goto("/?e2e=1")
  await expect(
    page.getByRole("button", { name: "Enter Chardin" }),
  ).toBeVisible()
  await tabTo(page, page.getByRole("combobox", { name: "Visual quality" }))
  await page.keyboard.press("Home")
  await page.keyboard.press("Enter")
  await expect(page.locator("canvas")).toHaveAttribute("data-quality", "low")
  await tabTo(page, page.getByRole("button", { name: "How to move" }))
  await page.keyboard.press("Space")
  await expect(page.getByLabel("Movement guide")).toBeVisible()
  await page.keyboard.press("Space")
  await expect(page.getByLabel("Movement guide")).toHaveCount(0)
  await tabTo(page, page.getByRole("button", { name: "Enter Chardin" }))
  await page.keyboard.press("Enter")
  await expect(page.locator("canvas")).toBeFocused()
  await page.keyboard.press("Escape")
  await page.evaluate(() => window.__CHARDIN_TEST__!.stepInput(1))
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible()
  await tabTo(page, page.getByRole("button", { name: "Resume" }))
  await info.attach("keyboard-paused", {
    body: await page.screenshot(),
    contentType: "image/png",
  })
  await page.keyboard.press("Enter")
  await expect(page.locator("canvas")).toBeFocused()
  await expect(page.locator(".status-line")).toContainText("running")
})

test("44 CSS-pixel controls and live reduced motion", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile-chromium")
  await page.goto("/?e2e=1")
  await expect(
    page.getByRole("button", { name: "Enter Chardin" }),
  ).toBeVisible()
  const ready = await targets(page)
  await page.getByRole("button", { name: "Enter Chardin" }).tap()
  const running = await targets(page)
  await page.emulateMedia({ reducedMotion: "reduce" })
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  )
  await page.evaluate(() => window.__CHARDIN_TEST__!.step(1))
  const first = await captureManualFrame(page)
  await page.evaluate(() => window.__CHARDIN_TEST__!.step(120))
  expect((await captureManualFrame(page)).equals(first)).toBe(true)
  await page.evaluate(() =>
    window.__CHARDIN_TEST__!.step(60, { move: { x: 0, y: 1 } }),
  )
  expect(
    await page.evaluate(() => window.__CHARDIN_TEST__!.snapshot().distance),
  ).toBeGreaterThan(1)
  await page.getByRole("button", { name: "How to move" }).tap()
  const guide = await targets(page)
  await info.attach("mobile-guide", {
    body: await page.screenshot(),
    contentType: "image/png",
  })
  await info.attach("touch-targets.json", {
    body: JSON.stringify({ ready, running, guide }),
    contentType: "application/json",
  })
})

test("unsupported WebGL retains keyboard recovery and usable health link", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type === "webgl2"
        ? null
        : Reflect.apply(original, this, [type, ...args])
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto("/")
  // Next's route announcer also has role="alert"; identify the application panel
  // by its heading so an empty (or text-only) announcement cannot match.
  const failure = page.getByRole("alert").filter({
    has: page.getByRole("heading", {
      name: "Chardin needs WebGL2 to open.",
      exact: true,
    }),
  })
  await expect(failure).toHaveCount(1)
  await expect(failure).toBeVisible()
  await tabTo(page, failure.getByRole("button", { name: "Retry", exact: true }))
  await page.keyboard.press("Enter")
  await expect(failure).toHaveCount(1)
  await expect(failure).toBeVisible()
  const health = failure.getByRole("link", {
    name: "Check system health",
    exact: true,
  })
  await expect(health).toHaveAttribute("href", "/api/health")
  await tabTo(page, health)
  await targets(page)
  expect(
    await page.evaluate(() => Object.hasOwn(window, "__CHARDIN_TEST__")),
  ).toBe(false)
  await info.attach("unsupported-webgl", {
    body: await page.screenshot(),
    contentType: "image/png",
  })
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/api\/health$/)
})
