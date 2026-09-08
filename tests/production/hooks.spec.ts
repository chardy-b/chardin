import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { identity, requireExactHead } from "../../scripts/lib/evidence.mjs"

test("ordinary production never exposes test hooks, even with the query flag", async ({
  page,
}) => {
  const state = identity()
  requireExactHead(state)
  const stamp = JSON.parse(
    readFileSync(".next/chardin-build-evidence.json", "utf8"),
  )
  expect(stamp.head).toBe(state.head)
  expect(stamp.hooks).toBe(false)
  expect(stamp.buildId).toBe(readFileSync(".next/BUILD_ID", "utf8").trim())
  await page.goto("/?e2e=1")
  await page.getByRole("button", { name: "Enter Chardin" }).click()
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-traveler-model",
    "loaded",
  )
  expect(
    await page.evaluate(() => Object.hasOwn(window, "__CHARDIN_TEST__")),
  ).toBe(false)
})
