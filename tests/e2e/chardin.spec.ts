import { expect, test } from "@playwright/test"

function intersects(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  )
}

test.describe("Chardin world", () => {
  test("desktop starts, moves, pauses, and resumes the real WebGL world", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium")
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto("/")
    await expect(
      page.getByRole("heading", { name: /follow the curve/i }),
    ).toBeVisible()
    await page.getByRole("button", { name: "Enter Chardin" }).click()
    await expect(page.locator(".status-line")).toContainText("running")
    const canvas = page.locator("canvas")
    await expect(canvas).toHaveAttribute("data-traveler-model", "loaded")
    const beforeMovement = await canvas.screenshot()
    await page.keyboard.down("ShiftLeft")
    await page.keyboard.down("KeyW")
    await page.waitForTimeout(800)
    await page.keyboard.up("KeyW")
    await page.keyboard.up("ShiftLeft")
    const afterMovement = await canvas.screenshot()
    expect(afterMovement.equals(beforeMovement)).toBe(false)
    expect(
      Number(await canvas.getAttribute("data-traveler-distance")),
    ).toBeGreaterThan(0.5)

    await page.keyboard.down("Escape")
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible()
    const paused = await canvas.screenshot()
    const distanceAtPause = await canvas.getAttribute("data-traveler-distance")
    await expect(canvas).toHaveAttribute("data-traveler-grounded", "true")
    await page.keyboard.down("Space")
    await page.keyboard.down("KeyE")
    await page.keyboard.down("KeyW")
    await page.waitForTimeout(500)
    await page.keyboard.up("KeyW")
    expect((await canvas.screenshot()).equals(paused)).toBe(true)
    if (process.env.CHARDIN_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.CHARDIN_EVIDENCE_DIR}/desktop-paused.png`,
        fullPage: true,
      })
    }
    await page.getByRole("button", { name: "Resume" }).evaluate((button) => {
      ;(button as HTMLButtonElement).click()
      for (const code of ["Escape", "Space", "KeyE"]) {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { code, repeat: true }),
        )
      }
    })
    await expect(page.locator(".status-line")).toContainText("running")
    await page.waitForTimeout(150)
    await expect(page.locator(".status-line")).toContainText("running")
    await expect(canvas).toHaveAttribute("data-traveler-grounded", "true")
    await expect(canvas).toHaveAttribute(
      "data-traveler-distance",
      distanceAtPause!,
    )
    await page.keyboard.up("Escape")
    await page.keyboard.up("Space")
    await page.keyboard.up("KeyE")
    const guide = page.getByRole("button", { name: "How to move" })
    await guide.focus()
    await page.keyboard.press("Space")
    await expect(page.getByLabel("Movement guide")).toBeVisible()
    await page.getByRole("button", { name: "Close guide" }).click()
    await page.keyboard.down("KeyW")
    await page.waitForTimeout(300)
    await page.keyboard.up("KeyW")
    expect((await canvas.screenshot()).equals(paused)).toBe(false)
    await expect(canvas).toBeVisible()
    expect(errors).toEqual([])
    if (process.env.CHARDIN_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.CHARDIN_EVIDENCE_DIR}/desktop-resumed.png`,
        fullPage: true,
      })
      await page.setViewportSize({ width: 820, height: 1180 })
      await page.getByRole("button", { name: "Pause", exact: true }).click()
      await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible()
      await page.screenshot({
        path: `${process.env.CHARDIN_EVIDENCE_DIR}/tablet-paused.png`,
        fullPage: true,
      })
      await page.getByRole("button", { name: "Resume" }).click()
      await expect(page.locator(".status-line")).toContainText("running")
      await page.screenshot({
        path: `${process.env.CHARDIN_EVIDENCE_DIR}/tablet-resumed.png`,
        fullPage: true,
      })
    }

    const health = await request.get("/api/health")
    expect(health.status()).toBe(200)
    await expect(health.json()).resolves.toEqual({ status: "ok" })
  })

  test("mobile touch controls drive and pause the real world", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium")
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")
    await expect(
      page.getByRole("button", { name: "Enter Chardin" }),
    ).toBeVisible()
    await page.getByRole("button", { name: "Enter Chardin" }).click()
    await expect(page.getByLabel("Touch controls")).toBeVisible()
    const canvas = page.locator("canvas")
    const guide = page.getByRole("button", { name: "How to move" })
    const guideBounds = await guide.boundingBox()
    expect(guideBounds).not.toBeNull()
    for (const target of await page.locator(".touch-target").all()) {
      const targetBounds = await target.boundingBox()
      expect(targetBounds).not.toBeNull()
      expect(intersects(guideBounds!, targetBounds!)).toBe(false)
    }
    await guide.tap()
    await expect(page.getByLabel("Movement guide")).toBeVisible()
    await page.getByRole("button", { name: "Close guide" }).tap()

    const move = page.getByLabel("Move traveler")
    const bounds = await move.boundingBox()
    expect(bounds).not.toBeNull()
    const cdp = await page.context().newCDPSession(page)
    const beforeMovement = await canvas.screenshot()
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: bounds!.x + bounds!.width / 2,
          y: bounds!.y + bounds!.height / 2,
        },
      ],
    })
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: bounds!.x + bounds!.width / 2, y: bounds!.y }],
    })
    await page.waitForTimeout(600)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    const afterMovement = await canvas.screenshot()
    expect(afterMovement.equals(beforeMovement)).toBe(false)

    const look = page.getByLabel("Look around")
    const lookBounds = await look.boundingBox()
    expect(lookBounds).not.toBeNull()
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: lookBounds!.x + lookBounds!.width / 2,
          y: lookBounds!.y + lookBounds!.height / 2,
        },
      ],
    })
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: lookBounds!.x + lookBounds!.width * 0.9,
          y: lookBounds!.y + lookBounds!.height / 2,
        },
      ],
    })
    await page.waitForTimeout(500)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    const afterLook = await canvas.screenshot()
    expect(afterLook.equals(afterMovement)).toBe(false)
    const touchPause = page
      .getByLabel("Touch controls")
      .getByRole("button", { name: "Pause" })
    await touchPause.tap()
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible()
    const paused = await canvas.screenshot()
    await touchPause.tap({ force: true })
    await page.waitForTimeout(400)
    expect((await canvas.screenshot()).equals(paused)).toBe(true)
    if (process.env.CHARDIN_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.CHARDIN_EVIDENCE_DIR}/mobile-paused.png`,
        fullPage: true,
      })
    }
    await page.getByRole("button", { name: "Resume" }).tap()
    await expect(page.locator(".status-line")).toContainText("running")
    await page.waitForTimeout(150)
    await expect(page.locator(".status-line")).toContainText("running")
    if (process.env.CHARDIN_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.CHARDIN_EVIDENCE_DIR}/mobile-resumed.png`,
        fullPage: true,
      })
    }
    expect(errors).toEqual([])
    const shell = await page.locator("main").boundingBox()
    expect(shell?.height).toBeGreaterThanOrEqual(
      page.viewportSize()?.height ?? 0,
    )
  })

  test("shows an accessible fallback when WebGL2 is unavailable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...args: unknown[]
      ) {
        if (type === "webgl2") return null
        return original.call(this, type, ...(args as []))
      } as typeof HTMLCanvasElement.prototype.getContext
    })
    await page.goto("/")
    await expect(
      page.getByRole("heading", { name: "Chardin needs WebGL2 to open." }),
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Check system health" }),
    ).toHaveAttribute("href", "/api/health")
  })

  test("retains the visible traveler fallback when the model request fails", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium")
    await page.route("**/models/traveler.glb", (route) =>
      route.fulfill({ status: 503, body: "unavailable" }),
    )
    await page.goto("/")
    await page.getByRole("button", { name: "Enter Chardin" }).click()
    const canvas = page.locator("canvas")
    await expect(canvas).toHaveAttribute("data-traveler-model", "fallback")
    await expect(canvas).toBeVisible()
    await expect(page.locator(".status-line")).toContainText("running")
  })
})
