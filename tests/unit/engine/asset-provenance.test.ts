import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import visualProvenance from "../../../docs/design/wil145-provenance.json"
import loop3Provenance from "../../../docs/design/wil146-provenance.json"
import pavilionProvenance from "../../../docs/design/wil125-provenance.json"
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
    [
      ...tracked,
      "src/engine/assets/manifest.ts",
      "src/engine/world/skyspace-landmark.ts",
      "src/engine/world/sky-controller.ts",
      "src/components/experience/pavilion-description.tsx",
      "src/app/globals.css",
      "scripts/generate-traveler.mjs",
      "src/engine/world/planet.ts",
      "src/engine/world/grass.ts",
      "src/engine/world/landmark-anchor.ts",
      "src/engine/player/traveler-view.ts",
      "src/engine/player/presentation.ts",
      "src/engine/player/contact-shadow.ts",
      "src/engine/player/foot-placement.ts",
      "src/engine/camera/third-person-camera.ts",
      "src/engine/three-runtime.ts",
      "src/engine/debug/test-api.ts",
      "src/engine/render/toon-material.ts",
      "src/engine/render/outline-effect.ts",
      "src/components/experience/chardin-experience.tsx",
    ].sort(),
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

it("matches both detailed provenance records to current source bytes without clearing legacy rights", () => {
  for (const provenance of [
    visualProvenance,
    pavilionProvenance,
    loop3Provenance,
  ]) {
    expect(provenance.externalInputs).toEqual([])
    expect(provenance.review.reviewer).toBeNull()
    expect(provenance.rightsStatus).toContain("pending")
    for (const entry of provenance.files) {
      const data = readFileSync(entry.path)
      expect(data.length).toBe(entry.bytes)
      expect(createHash("sha256").update(data).digest("hex")).toBe(entry.sha256)
      const inventoried = inventory.entries.find(
        (record) => record.path === entry.path,
      )!
      expect(inventoried.sha256).toBe(entry.sha256)
    }
  }
  expect(
    inventory.entries.filter(
      (entry) =>
        entry.path.startsWith("public/moodboard/") &&
        entry.rights.includes("unresolved"),
    ),
  ).toHaveLength(12)
})
