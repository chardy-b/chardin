import { existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { identity } from "./evidence.mjs"
import {
  contained,
  readRegular,
  reserveAttempt,
  safeDirectory,
  writeJson,
} from "./evidence-store.mjs"

/** @returns {{ outputDir: string, reporter: import("@playwright/test").ReporterDescription[] }} */
export function playwrightEvidence(gate) {
  // Playwright's JSON environment options take precedence over config outputFile.
  for (const key of [
    "PLAYWRIGHT_JSON_OUTPUT_FILE",
    "PLAYWRIGHT_JSON_OUTPUT_DIR",
    "PLAYWRIGHT_JSON_OUTPUT_NAME",
  ])
    if (process.env[key])
      throw new Error(`Remove ${key}; evidence owns reporter paths`)
  let dir = process.env.CHARDIN_PLAYWRIGHT_DIR
  const standalone = !process.env.CHARDIN_EVIDENCE_DIR
  if (!dir) {
    if (standalone) {
      const before = identity()
      dir = reserveAttempt({
        head: before.head,
        gate,
        metadata: { before, exact: false },
      })
    } else {
      const parent = contained(
        resolve(".hermes/execution/chardin/release"),
        process.env.CHARDIN_EVIDENCE_DIR,
      )
      const started = JSON.parse(readRegular(parent, "started.json"))
      if (started.gate !== gate)
        throw new Error("Wrong gate for browser evidence")
      if (
        ["result.json", "manifest.json", "manifest.sha256"].some((name) =>
          existsSync(join(parent, name)),
        )
      )
        throw new Error("Cannot add browser output to a finalized attempt")
      dir = join(parent, "playwright")
      safeDirectory(parent)
      mkdirSync(dir, { mode: 0o700 })
    }
    writeJson(dir, "playwright-owner.json", { pid: process.pid, gate })
    // Config is reloaded in workers; they inherit the reserved directory.
    process.env.CHARDIN_PLAYWRIGHT_DIR = dir
  }
  contained(resolve(".hermes/execution/chardin/release"), dir)
  safeDirectory(dir)
  const owner = JSON.parse(readRegular(dir, "playwright-owner.json"))
  if (
    owner.gate !== gate ||
    ![process.pid, process.ppid].includes(owner.pid) ||
    ["result.json", "reporter-result.json", "manifest.json"].some((name) =>
      existsSync(join(dir, name)),
    )
  )
    throw new Error("Cannot reuse an existing browser attempt")
  return {
    outputDir: join(dir, "output"),
    reporter: [
      ["list"],
      [resolve("scripts/evidence-reporter.mjs"), { dir, standalone }],
      ["json", { outputFile: join(dir, "reporter.json") }],
    ],
  }
}
