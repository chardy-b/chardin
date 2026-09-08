// @vitest-environment node
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"

const config = resolve("vitest.config.ts")
const cli = resolve("node_modules/vitest/vitest.mjs")
const tracked = [
  "tests/unit/engine/evidence-audit.test.mjs",
  "tests/components/example.test.tsx",
  "src/engine/example.spec.ts",
  "tests/unit/snapshot/retained.test.ts",
]
const generated = [
  ".hermes/example.test.ts",
  ".hermes/execution/chardin/wil123-audit-remediation/snapshot/tests/unit/engine/evidence-audit.test.mjs",
  ".hermes/execution/chardin/release/head/attempt/snapshot/src/engine/example.spec.ts",
]
let cwd

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "chardin vitest config "))
  writeFileSync(join(cwd, ".gitignore"), "/.hermes/\n")
  for (const file of [...tracked, ...generated]) {
    mkdirSync(dirname(join(cwd, file)), { recursive: true })
    // Discovery must not load retained snapshots with broken relative imports.
    writeFileSync(join(cwd, file), 'import "./missing-fixture-module"\n')
  }
  execFileSync("git", ["init", "--quiet"], { cwd })
  execFileSync("git", ["add", ".gitignore", ...tracked], { cwd })
})

afterEach(() => rmSync(cwd, { recursive: true, force: true }))

it.each(["", "true"])(
  "excludes generated Hermes evidence while discovering tracked tests (CI=%s)",
  (CI) => {
    const discovered = JSON.parse(
      execFileSync(
        process.execPath,
        [
          cli,
          "list",
          "--root",
          cwd,
          "--config",
          config,
          "--filesOnly",
          "--json",
        ],
        {
          cwd,
          env: { ...process.env, CI },
          encoding: "utf8",
          stdio: "pipe",
          timeout: 15_000,
        },
      ),
    )
    expect(discovered.map(({ file }) => relative(cwd, file)).sort()).toEqual(
      tracked.toSorted(),
    )
    expect(
      execFileSync("git", ["ls-files", "--", ...tracked, ...generated], {
        cwd,
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .sort(),
    ).toEqual(tracked.toSorted())
  },
)
