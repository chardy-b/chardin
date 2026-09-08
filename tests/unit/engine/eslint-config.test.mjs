// @vitest-environment node
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { ESLint } from "eslint"
import { expect, it } from "vitest"

it("excludes only generated Hermes evidence while discovering tracked lint inputs", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "chardin eslint config "))
  const tracked = [
    "src/app/page.tsx",
    "src/engine/example.spec.ts",
    "tests/unit/engine/example.test.mjs",
    "tests/unit/snapshot/retained.test.ts",
    "scripts/example.mjs",
    ".hermes-source/example.js",
  ]
  const generated = [
    ".hermes/example.js",
    ".hermes/execution/chardin/release/head/attempt/coverage/prettify.js",
    ".hermes/execution/chardin/snapshot/src/app/page.tsx",
    ".hermes/execution/chardin/snapshot/tests/unit/engine/example.test.mjs",
  ]
  try {
    writeFileSync(join(cwd, ".gitignore"), "/.hermes/\n")
    for (const file of [...tracked, ...generated]) {
      mkdirSync(dirname(join(cwd, file)), { recursive: true })
      writeFileSync(
        join(cwd, file),
        generated.includes(file)
          ? "const = deliberately invalid\n"
          : "export {}\n",
      )
    }
    execFileSync("git", ["init", "--quiet"], { cwd })
    execFileSync("git", ["add", ".gitignore", ...tracked], { cwd })
    const eslint = new ESLint({
      cwd,
      overrideConfigFile: resolve("eslint.config.mjs"),
    })
    for (const file of generated)
      expect(await eslint.isPathIgnored(join(cwd, file))).toBe(true)
    for (const file of tracked)
      expect(await eslint.isPathIgnored(join(cwd, file))).toBe(false)
    const results = await eslint.lintFiles(["."])
    expect(
      results.map(({ filePath }) => relative(cwd, filePath)).sort(),
    ).toEqual(tracked.toSorted())
    expect(
      results.every(
        ({ errorCount, warningCount }) => !errorCount && !warningCount,
      ),
    ).toBe(true)
    expect(
      execFileSync("git", ["ls-files", "--", ...tracked, ...generated], {
        cwd,
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .sort(),
    ).toEqual(tracked.toSorted())
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
