// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest"
import { createHash } from "node:crypto"
import {
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join, relative } from "node:path"
import {
  contained,
  exclusiveLog,
  finalizeAttempt,
  inventory,
  readAttempt,
  readRegular,
  reserveAttempt,
  writeExclusive,
} from "../../../scripts/lib/evidence-store.mjs"
import EvidenceReporter from "../../../scripts/evidence-reporter.mjs"
import { sanitizedStream } from "../../../scripts/lib/evidence-process.mjs"

let cwd
const head = "a".repeat(40)
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "chardin evidence "))
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))
const reserve = (id) =>
  reserveAttempt({ cwd, head, gate: "browser", ...(id ? { id } : {}) })

it("verifies a real sealed attempt by relative and absolute directory paths", () => {
  const dir = reserve()
  const relativeDir = relative(process.cwd(), dir)
  expect(isAbsolute(relativeDir)).toBe(false)
  writeExclusive(dir, "nested/artifact.bin", Buffer.from([0, 1, 255]))
  finalizeAttempt(dir, { status: "pass", exitCode: 0 })
  const result = readAttempt(dir)
  expect(result).toMatchObject({ status: "pass", exitCode: 0 })
  expect(readAttempt(relativeDir)).toEqual(result)
  expect(inventory(relativeDir)).toEqual(inventory(dir))

  writeExclusive(dir, "extra.txt", "unexpected membership")
  for (const path of [dir, relativeDir])
    expect(() => readAttempt(path)).toThrow(/membership/)
  rmSync(join(dir, "extra.txt"))
  writeFileSync(join(dir, "nested/artifact.bin"), "tampered")
  for (const path of [dir, relativeDir])
    expect(() => readAttempt(path)).toThrow(/hash/)
})

it("reserves exclusive attempts, retains failed runs and hashes all bytes including manifests", () => {
  const first = reserve()
  for (const path of [
    "reporter.json",
    "attachments/body.png",
    "attachments/path.zip",
    "coverage/coverage-final.json",
    "command.log",
  ])
    writeExclusive(first, path, Buffer.from([0, 1, 255]))
  finalizeAttempt(first, { status: "fail", exitCode: 7 })
  const original = inventory(first)
  const second = reserve()
  writeExclusive(second, "reporter.json", "new attempt")
  finalizeAttempt(second, { status: "pass", exitCode: 0 })
  expect(first).not.toBe(second)
  expect(inventory(first)).toEqual(original)
  expect(readAttempt(first).exitCode).toBe(7)
  expect(readAttempt(second).exitCode).toBe(0)
  const manifest = JSON.parse(readRegular(first, "manifest.json"))
  for (const artifact of manifest.artifacts) {
    const bytes = readFileSync(join(first, artifact.path))
    expect(artifact.bytes).toBe(bytes.length)
    expect(artifact.sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    )
  }
  expect(readRegular(first, "manifest.sha256").toString().trim()).toBe(
    createHash("sha256")
      .update(readRegular(first, "manifest.json"))
      .digest("hex"),
  )
  expect(() => writeExclusive(first, "reporter.json", "overwrite")).toThrow()
  expect(() => finalizeAttempt(first, { status: "pass" })).toThrow()
  expect(inventory(first)).toEqual(original)
  writeFileSync(join(first, "command.log"), "tampering")
  expect(() => readAttempt(first)).toThrow(/hash/)
})

it("refuses deterministic collisions, path escapes and symlinked ancestors/targets", () => {
  const first = reserve("collision")
  expect(() => reserve("collision")).toThrow(/EEXIST/)
  expect(() => reserve("../escape")).toThrow(/Invalid/)
  expect(() => contained(first, "../outside")).toThrow(/containment/)
  expect(() => contained(first, `${first}-prefix/outside`)).toThrow(
    /containment/,
  )
  symlinkSync(cwd, join(first, "redirect"))
  expect(() => writeExclusive(first, "redirect/outside", "bad")).toThrow(
    /symlink/,
  )
  symlinkSync(join(cwd, "missing"), join(first, "dangling"))
  expect(() => writeExclusive(first, "dangling", "bad")).toThrow()
  expect(() => inventory(first)).toThrow(/Symlink/)
  const other = mkdtempSync(join(tmpdir(), "chardin outside "))
  try {
    symlinkSync(other, join(cwd, "redirect-root"))
    expect(() =>
      reserveAttempt({ cwd, head, gate: "fixture", id: "safe" }),
    ).not.toThrow()
    rmSync(join(cwd, ".hermes"), { recursive: true })
    symlinkSync(other, join(cwd, ".hermes"))
    expect(() => reserve()).toThrow(/symlink/)
  } finally {
    rmSync(other, { recursive: true, force: true })
  }
})

it("rejects symlink/hardlink artifact reads and explicitly identifies unfinished records", () => {
  const dir = reserve()
  expect(readAttempt(dir).status).toBe("incomplete")
  const log = exclusiveLog(dir, "partial.log")
  log.write("durable partial output\n")
  expect(readRegular(dir, "partial.log").toString()).toContain("durable")
  log.close()
  writeExclusive(dir, "result.json", JSON.stringify({ status: "pass" }))
  expect(readAttempt(dir).status).toBe("incomplete")
  writeExclusive(dir, "manifest.sha256", "partial")
  expect(readAttempt(dir).status).toBe("incomplete")
  symlinkSync(join(dir, "partial.log"), join(dir, "linked.log"))
  expect(() => readRegular(dir, "linked.log")).toThrow(/regular/)
  linkSync(join(dir, "partial.log"), join(dir, "hard.log"))
  expect(() => readRegular(dir, "hard.log")).toThrow(/regular/)
})

it("persists reporter bodies and path attachments, including retries and duplicate names", () => {
  // Reporter path inputs must be contained in the current trusted checkout.
  const dir = reserve()
  const reporter = new EvidenceReporter({ dir })
  const source =
    "tests/e2e/chardin.visual.spec.ts-snapshots/spawn-chromium-linux.png"
  const test = { id: "test-id", titlePath: () => ["project", "test"] }
  const attachments = [
    {
      name: "../../escape",
      contentType: "application/json",
      body: Buffer.from('{"sample":1}'),
    },
    { name: "../../escape", contentType: "image/png", path: source },
  ]
  reporter.onStdOut("partial reporter log\n")
  reporter.onTestEnd(test, { attachments, retry: 0, status: "failed" })
  reporter.onTestEnd(test, { attachments, retry: 1, status: "passed" })
  expect(reporter.onEnd({ status: "passed" })).toEqual({ status: "passed" })
  writeExclusive(
    dir,
    "reporter.json",
    JSON.stringify({
      results: attachments.map((a) => ({
        ...a,
        body: a.body?.toString("base64"),
      })),
    }),
  )
  reporter.onExit()
  const list = JSON.parse(readRegular(dir, "attachments.json"))
  expect(list).toHaveLength(4)
  expect(new Set(list.map((a) => a.path)).size).toBe(4)
  expect(readRegular(dir, list[0].path).toString()).toBe('{"sample":1}')
  expect(readRegular(dir, list[1].path)).toEqual(readFileSync(source))
  finalizeAttempt(dir, { status: "fail", exitCode: 1 })
  expect(readAttempt(dir).status).toBe("fail")
})

it("fails reporter retention for escaping or symlinked attachments", () => {
  const dir = reserve()
  const reporter = new EvidenceReporter({ dir })
  reporter.onTestEnd(
    { id: "x", titlePath: () => [] },
    {
      attachments: [
        { name: "outside", contentType: "text/plain", path: "/etc/passwd" },
      ],
      retry: 0,
      status: "passed",
    },
  )
  expect(reporter.onEnd({ status: "passed" }).status).toBe("failed")
  writeExclusive(dir, "reporter.json", "{}")
  reporter.onExit()
  expect(
    JSON.parse(readRegular(dir, "reporter-result.json")).errors[0],
  ).toContain("containment")
})

it("sanitizes split scanner streams before durable writes without mixing stdout and stderr", () => {
  let output = ""
  const stream = sanitizedStream((text) => {
    output += text
  }, true)
  stream.write('{"DetectorName":"GitHub","Raw":"cred')
  expect(output).toBe("")
  stream.write('ential","Verified":true}\nraw secret diagnostic\n')
  stream.write("x".repeat(70000))
  stream.end()
  expect(output).toContain('"detector":"GitHub","verified":true')
  expect(output).not.toMatch(/credential|raw secret/)
  let ordinary = ""
  const normal = sanitizedStream((text) => {
    ordinary += text
  })
  normal.write("token=top")
  normal.write("secret\n\u001b[31mready\u001b[0m\n")
  normal.end()
  expect(ordinary).toBe("token=[REDACTED]\nready\n")
})

it("identifies interruption during initial record reservation as incomplete", () => {
  expect(readAttempt(cwd).status).toBe("incomplete")
  writeExclusive(cwd, "started.json", '{"status":')
  expect(readAttempt(cwd)).toEqual({
    status: "incomplete",
    reason: "Started record is partial",
  })
})
