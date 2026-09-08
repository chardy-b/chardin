import { spawn } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { identity, requireExactHead, sha256 } from "./lib/evidence.mjs"
import { PERFORMANCE_TIMEOUTS } from "./lib/performance-workload.mjs"

const commands = {
  format: ["pnpm", "format:check"],
  lint: ["pnpm", "lint"],
  types: ["pnpm", "typecheck"],
  coverage: ["pnpm", "test:coverage"],
  build: ["pnpm", "build"],
  production: [
    "pnpm",
    "exec",
    "playwright",
    "test",
    "--config=playwright.production.config.ts",
  ],
  browser: ["pnpm", "test:e2e"],
  performance: ["pnpm", "measure:performance"],
  bundle: ["pnpm", "measure:bundle"],
  audit: ["pnpm", "audit", "--audit-level=high", "--json"],
  secrets: [
    "trufflehog",
    "git",
    "file://" + process.cwd(),
    "--no-update",
    "--no-verification",
    "--fail",
    "--json",
  ],
}
const gate = process.argv[2]
if (!Object.hasOwn(commands, gate))
  throw new Error(`Choose one gate: ${Object.keys(commands).join(", ")}`)
const before = identity()
requireExactHead(before)
const dir = resolve(".hermes/execution/chardin/release", before.head)
await mkdir(dir, { recursive: true })
const start = new Date().toISOString()
const command = commands[gate]
const chunks = []
// Scanner JSON can contain raw credentials. Retain only detector metadata, never
// scanner stdout/stderr or credential fields. Audit JSON contains package data.
let scannerLines = ""
const safeScannerLine = (line) => {
  try {
    const finding = JSON.parse(line)
    return (
      JSON.stringify({
        detector: finding.DetectorName ?? "diagnostic",
        verified: finding.Verified === true,
      }) + "\n"
    )
  } catch {
    return "[scanner diagnostic omitted]\n"
  }
}
const recordOutput = (chunk) => {
  if (gate === "secrets") {
    scannerLines += chunk.toString()
    const lines = scannerLines.split("\n")
    scannerLines = lines.pop()
    for (const line of lines)
      if (line) chunks.push(Buffer.from(safeScannerLine(line)))
  } else {
    chunks.push(chunk)
    process.stdout.write(chunk)
  }
}
const child = spawn(command[0], command.slice(1), {
  env: { ...process.env, NEXT_PUBLIC_E2E_HOOKS: "false" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: process.platform !== "win32",
})
// Bound stalled tools; no retry can overwrite a failed attempt.
let timedOut = false
let forceTimer
const stop = (signal) => {
  if (!child.pid) return
  try {
    if (process.platform === "win32") child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch {
    /* The process group may already have exited. */
  }
}
const timer = setTimeout(
  () => {
    timedOut = true
    stop("SIGTERM")
    forceTimer = setTimeout(() => stop("SIGKILL"), 5000)
  },
  gate === "performance" ? PERFORMANCE_TIMEOUTS.runnerMs : 20 * 60 * 1000,
)
for (const stream of [child.stdout, child.stderr])
  stream.on("data", recordOutput)
child.on("error", (error) => chunks.push(Buffer.from(error.message)))
const { code, signal } = await new Promise((resolveExit) =>
  child.on("close", (code, signal) => resolveExit({ code, signal })),
)
clearTimeout(timer)
clearTimeout(forceTimer)
if (scannerLines) chunks.push(Buffer.from(safeScannerLine(scannerLines)))
if (gate === "secrets") process.stdout.write(Buffer.concat(chunks))
const after = identity()
const log = Buffer.concat(chunks)
const success =
  !timedOut && code === 0 && !after.dirty && after.head === before.head
const attempt = start.replaceAll(/[:.]/g, "-")
const logPath = `${dir}/${gate}-${attempt}.log`
await writeFile(logPath, log)
const record = {
  schema: 1,
  gate,
  command,
  before,
  after,
  start,
  end: new Date().toISOString(),
  code,
  signal,
  timedOut,
  status: success ? "pass" : "fail",
  logPath,
  logSha256: sha256(log),
  lockSha256: sha256(await readFile("pnpm-lock.yaml")),
}
await writeFile(
  `${dir}/${gate}-${attempt}.json`,
  JSON.stringify(record, null, 2) + "\n",
)
if (gate === "build" && success)
  await writeFile(
    ".next/chardin-build-evidence.json",
    JSON.stringify({
      ...before,
      hooks: false,
      buildId: (await readFile(".next/BUILD_ID", "utf8")).trim(),
      recordedAt: record.end,
    }),
  )
process.exitCode = success ? 0 : 1
