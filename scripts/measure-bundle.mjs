import { readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  contained,
  readRegular,
  writeJson,
  safeDirectory,
} from "./lib/evidence-store.mjs"
import { gzipSync } from "node:zlib"
import { identity, requireExactHead, sha256 } from "./lib/evidence.mjs"
import { summarize } from "./lib/measurement.mjs"
import { loadPerformanceBudgets } from "./lib/performance-budgets.mjs"

if (!process.env.CHARDIN_EVIDENCE_DIR)
  throw new Error(
    "Use pnpm measure:bundle or pnpm evidence bundle to reserve an attempt",
  )
const evidenceDir = contained(
  resolve(".hermes/execution/chardin/release"),
  process.env.CHARDIN_EVIDENCE_DIR,
)
const started = JSON.parse(readRegular(evidenceDir, "started.json"))
if (
  started.gate !== "bundle" ||
  ["result.json", "manifest.json", "manifest.sha256"].some((name) =>
    existsSync(join(evidenceDir, name)),
  )
)
  throw new Error("Bundle output requires an unfinished bundle attempt")
const state = identity()
requireExactHead(state)
const stamp = JSON.parse(
  readRegular(process.cwd(), ".next/chardin-build-evidence.json"),
)
const buildId = readRegular(process.cwd(), ".next/BUILD_ID").toString().trim()
if (
  stamp.head !== state.head ||
  stamp.tree !== state.tree ||
  stamp.hooks !== false ||
  stamp.buildId !== buildId
)
  throw new Error(
    "Build evidence does not match this production build and exact head; run pnpm evidence build",
  )
async function files(dir) {
  safeDirectory(dir)
  const paths = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink()) throw new Error("Symlink in production chunks")
    if (entry.isDirectory()) paths.push(...(await files(path)))
    else if (/\.(js|css)$/.test(path)) paths.push(path)
  }
  return paths.sort()
}
const entries = []
for (const path of await files(".next/static")) {
  const bytes = readRegular(process.cwd(), path)
  entries.push({
    path,
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes, { level: 9 }).length,
    sha256: sha256(bytes),
  })
}
if (!entries.some((entry) => entry.path.endsWith(".js")))
  throw new Error("No production JS chunks found")
const budgets = loadPerformanceBudgets()
const report = {
  schema: 1,
  ...state,
  buildId,
  recordedAt: new Date().toISOString(),
  method:
    "All .next/static JS and CSS, per-file gzip level 9; entire client output, not route transfer size or server output",
  entries,
  javascriptGzipBytes: summarize(
    [
      entries
        .filter((entry) => entry.path.endsWith(".js"))
        .reduce((sum, entry) => sum + entry.gzipBytes, 0),
    ],
    budgets.bundle.javascriptGzipBytes,
  ),
  rawBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
}
writeJson(evidenceDir, "bundle.json", report)
process.stdout.write(JSON.stringify(report, null, 2) + "\n")
if (
  process.env.CHARDIN_ENFORCE_BUDGETS === "true" &&
  report.javascriptGzipBytes.status !== "pass"
)
  process.exitCode = 1
