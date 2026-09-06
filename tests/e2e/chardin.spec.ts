import { expect, test } from "@playwright/test"

test.describe("Chardin world", () => {
  test("desktop starts, moves, pauses, and resumes the real WebGL world", async ({
    page,
    request,
  }) => {
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
    await page.getByRole("button", { name: "Pause" }).click()
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible()
    await page.getByRole("button", { name: "Resume" }).click()
    await expect(page.locator(".status-line")).toContainText("running")
    await expect(page.locator("canvas")).toBeVisible()
    expect(errors).toEqual([])

    const health = await request.get("/api/health")
    expect(health.status()).toBe(200)
    await expect(health.json()).resolves.toEqual({ status: "ok" })
  })

  test("mobile renders a usable full-viewport world shell", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/")
    await expect(
      page.getByRole("button", { name: "Enter Chardin" }),
    ).toBeVisible()
    await page.getByRole("button", { name: "How to move" }).click()
    await expect(page.getByLabel("Movement guide")).toBeVisible()
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
