import { readdir, readFile } from "node:fs/promises"
import { resolve, join } from "node:path"

const summaryPath = join(
  process.env.CHARDIN_COVERAGE_DIR ?? "coverage",
  "coverage-summary.json",
)
const summary = JSON.parse(await readFile(summaryPath, "utf8"))
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) await check(file)
    else if (
      file.endsWith(".ts") &&
      !file.endsWith(".d.ts") &&
      !Object.hasOwn(summary, resolve(file))
    )
      throw new Error(`Engine file absent from coverage: ${file}`)
  }
}
await check("src/engine")
process.stdout.write(`Every engine source file appears in ${summaryPath}\n`)
