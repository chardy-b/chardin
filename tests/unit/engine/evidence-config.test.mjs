// @vitest-environment node
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"

const JSON_INDEX = 2
const ATTACHMENT_INDEX = 1
const helper = new URL(
  "../../../scripts/lib/playwright-evidence.mjs",
  import.meta.url,
).href
let cwd
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "chardin config "))
  execFileSync("git", ["clone", "--quiet", "--shared", resolve("."), cwd], {
    stdio: "pipe",
  })
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))
function config(env = {}) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { playwrightEvidence } from ${JSON.stringify(helper)}; console.log(JSON.stringify(playwrightEvidence('browser')))`,
      ],
      {
        cwd,
        env: {
          ...process.env,
          CHARDIN_EVIDENCE_DIR: "",
          CHARDIN_PLAYWRIGHT_DIR: "",
          ...env,
        },
        encoding: "utf8",
        stdio: "pipe",
      },
    ),
  )
}
it.each(["", "true"])(
  "always retains JSON and attachments with unique paths locally and in CI=%s",
  (CI) => {
    const first = config({ CI })
    const second = config({ CI })
    expect(first.outputDir).not.toBe(second.outputDir)
    expect(first.reporter[JSON_INDEX][0]).toBe("json")
    expect(first.reporter[JSON_INDEX][1].outputFile).toContain("/reporter.json")
    expect(first.reporter[ATTACHMENT_INDEX][1].standalone).toBe(true)
    const started = JSON.parse(
      readFileSync(
        join(first.reporter[ATTACHMENT_INDEX][1].dir, "started.json"),
        "utf8",
      ),
    )
    expect(started.status).toBe("incomplete")
    for (const file of [
      "playwright.config.ts",
      "playwright.performance.config.ts",
      "playwright.production.config.ts",
    ])
      expect(readFileSync(file, "utf8")).toContain(
        "reporter: evidence.reporter",
      )
  },
)
it("rejects reporter environment overrides and paths outside the evidence root", () => {
  expect(() =>
    config({ PLAYWRIGHT_JSON_OUTPUT_FILE: join(cwd, "overwrite.json") }),
  ).toThrow()
  expect(() => config({ CHARDIN_PLAYWRIGHT_DIR: "/tmp" })).toThrow()
})

it("refuses an old config directory before a runner can clear its output", () => {
  const first = config()
  expect(() =>
    config({ CHARDIN_PLAYWRIGHT_DIR: first.reporter[ATTACHMENT_INDEX][1].dir }),
  ).toThrow()
  expect(
    readFileSync(
      join(first.reporter[ATTACHMENT_INDEX][1].dir, "started.json"),
      "utf8",
    ),
  ).toContain('"status": "incomplete"')
})

it("cannot append browser output to an already finalized wrapper attempt", () => {
  const first = config()
  const dir = first.reporter[ATTACHMENT_INDEX][1].dir
  writeFileSync(join(dir, "result.json"), '{"status":"fail"}')
  expect(() => config({ CHARDIN_EVIDENCE_DIR: dir })).toThrow()
})
