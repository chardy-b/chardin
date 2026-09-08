import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import inventory from "../../../docs/asset-inventory.json"

it("requires every distributed asset and visual baseline to have a matching provenance record", () => {
  const tracked = execFileSync(
    "git",
    ["ls-files", "public", "src/app/favicon.ico", "tests/e2e/*snapshots*"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((path) => !path.endsWith(".md"))
  expect(inventory.entries.map((entry) => entry.path).sort()).toEqual(
    tracked.sort(),
  )
  for (const entry of inventory.entries) {
    const bytes = readFileSync(entry.path)
    expect(bytes.length, entry.path).toBe(entry.bytes)
    expect(createHash("sha256").update(bytes).digest("hex"), entry.path).toBe(
      entry.sha256,
    )
    expect(entry.source).not.toBe("")
    expect(entry.rights).not.toBe("")
  }
})
