import { expect, test } from "@playwright/test"

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
    await page.keyboard.down("ShiftLeft")
    await page.keyboard.down("KeyW")
    await page.waitForTimeout(10_000)
    await page.keyboard.up("KeyW")
    await page.keyboard.up("ShiftLeft")
    await page.keyboard.press("Space")
    await page.waitForTimeout(1_000)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible()
    await page.getByRole("button", { name: "Resume" }).click()
    await expect(page.locator(".status-line")).toContainText("running")
    await expect(page.locator("canvas")).toBeVisible()
    expect(errors).toEqual([])
    if (process.env.CHARDIN_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.CHARDIN_EVIDENCE_DIR}/desktop-running.png`,
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
    const move = page.getByLabel("Move traveler")
    const bounds = await move.boundingBox()
    expect(bounds).not.toBeNull()
    const cdp = await page.context().newCDPSession(page)
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
    await page.waitForTimeout(500)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    const jump = page.getByRole("button", { name: "Jump" })
    const jumpBounds = await jump.boundingBox()
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: jumpBounds!.x + jumpBounds!.width / 2,
          y: jumpBounds!.y + jumpBounds!.height / 2,
        },
      ],
    })
    await page.waitForTimeout(100)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    if (process.env.CHARDIN_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.CHARDIN_EVIDENCE_DIR}/mobile-touch-running.png`,
        fullPage: true,
      })
    }
    const touchPause = page
      .getByLabel("Touch controls")
      .getByRole("button", { name: "Pause" })
    await touchPause.dispatchEvent("pointerdown", {
      pointerId: 23,
      pointerType: "touch",
    })
    await page.waitForTimeout(100)
    expect(errors).toEqual([])
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible()
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
})
