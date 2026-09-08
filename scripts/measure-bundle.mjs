import { readdir, readFile, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { identity, requireExactHead, sha256 } from "./lib/evidence.mjs"
import { summarize } from "./lib/measurement.mjs"

const state = identity()
requireExactHead(state)
const stamp = JSON.parse(
  await readFile(".next/chardin-build-evidence.json", "utf8"),
)
const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim()
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
  const paths = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) paths.push(...(await files(path)))
    else if (/\.(js|css)$/.test(path)) paths.push(path)
  }
  return paths.sort()
}
const entries = []
for (const path of await files(".next/static")) {
  const bytes = await readFile(path)
  entries.push({
    path,
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes, { level: 9 }).length,
    sha256: sha256(bytes),
  })
}
if (!entries.some((entry) => entry.path.endsWith(".js")))
  throw new Error("No production JS chunks found")
const budgets = JSON.parse(
  await readFile("docs/performance-budgets.json", "utf8"),
)
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
const dir = `.hermes/execution/chardin/release/${state.head}`
await mkdir(dir, { recursive: true })
await writeFile(
  `${dir}/bundle-${Date.now()}.json`,
  JSON.stringify(report, null, 2) + "\n",
)
process.stdout.write(JSON.stringify(report, null, 2) + "\n")
if (
  process.env.CHARDIN_ENFORCE_BUDGETS === "true" &&
  report.javascriptGzipBytes.status !== "pass"
)
  process.exitCode = 1
