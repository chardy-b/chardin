// @vitest-environment node
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { expect, it, vi } from "vitest"

it.each([
  ["skyspace.spec.ts", 60_000, 3],
  ["skyspace.visual.spec.ts", 480_000, 1],
] as const)(
  "collects %s with its fixture budget and zero retries",
  (file, timeout, count) => {
    const configure = vi.fn()
    const register = vi.fn(() => {
      // This runs during definition, without invoking bodies or browser fixtures.
      expect(configure).toHaveBeenCalledExactlyOnceWith({ timeout, retries: 0 })
    })
    const test = Object.assign(register, { describe: { configure } })
    const source = readFileSync(`tests/e2e/${file}`, "utf8")
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText
    runInNewContext(compiled, {
      exports: {},
      require: (name: string) => (name === "@playwright/test" ? { test } : {}),
    })
    expect(register).toHaveBeenCalledTimes(count)
    expect(source).not.toMatch(/test\.setTimeout\s*\(/)
  },
)
