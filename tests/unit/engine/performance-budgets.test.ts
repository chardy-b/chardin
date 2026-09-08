// @vitest-environment node
import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, beforeEach, expect, it } from "vitest"
import { loadPerformanceBudgets } from "../../../scripts/lib/performance-budgets.mjs"
import { summarize } from "../../../scripts/lib/measurement.mjs"

const loader = new URL(
  "../../../scripts/lib/performance-budgets.mjs",
  import.meta.url,
)
const budgetFile = new URL(
  "../../../docs/performance-budgets.json",
  import.meta.url,
)
let fixture: string

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "chardin budgets "))
})
afterEach(() => rmSync(fixture, { recursive: true, force: true }))

function runLoader(url: URL) {
  // Bypass Vitest's module transform: exercise the native ESM runtime that failed.
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { loadPerformanceBudgets } from ${JSON.stringify(url.href)};
       console.log(JSON.stringify(loadPerformanceBudgets()));`,
    ],
    { cwd: fixture, encoding: "utf8", timeout: 10_000 },
  )
}

it("loads the canonical budget file in native Node ESM independently of cwd", () => {
  const result = runLoader(loader)
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  expect(result.stderr).toBe("")
  expect(JSON.parse(result.stdout)).toEqual(
    JSON.parse(readFileSync(budgetFile, "utf8")),
  )
})

it.each([
  ["missing", undefined, "ENOENT"],
  ["malformed", "{", "SyntaxError"],
] as const)("fails closed on a %s budget file", (_, contents, error) => {
  const lib = join(fixture, "scripts/lib")
  mkdirSync(lib, { recursive: true })
  const fixtureLoader = join(lib, "performance-budgets.mjs")
  copyFileSync(loader, fixtureLoader)
  if (contents !== undefined) {
    mkdirSync(join(fixture, "docs"))
    writeFileSync(join(fixture, "docs/performance-budgets.json"), contents)
  }
  const result = runLoader(pathToFileURL(fixtureLoader))
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  expect(result.stderr).toContain(error)
  expect(result.stdout).toBe("")
})

it("preserves pending and numeric limits for fail-closed enforcement", () => {
  const budgets = loadPerformanceBudgets()
  for (const group of [
    budgets["desktop-high"],
    budgets["mobile-emulation-low"],
    budgets.bundle,
  ])
    for (const budget of Object.values(group))
      if (budget === null)
        expect(summarize([1], budget).status).toBe("budget-pending")
      else {
        expect(summarize([budget], budget).status).toBe("pass")
        expect(summarize([budget + 1], budget).status).toBe("fail")
      }
})
