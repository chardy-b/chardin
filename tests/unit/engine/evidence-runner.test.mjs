// @vitest-environment node
import { execFileSync, spawn } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { identity, requireExactHead } from "../../../scripts/lib/evidence.mjs"
import {
  inventory,
  readAttempt,
  readRegular,
} from "../../../scripts/lib/evidence-store.mjs"
import { runEvidence } from "../../../scripts/lib/evidence-runner.mjs"

const repo = resolve(".")
const runner = new URL(
  "../../../scripts/lib/evidence-runner.mjs",
  import.meta.url,
).href
let cwd
let head
const owned = []
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "chardin process "))
  execFileSync("git", ["clone", "--quiet", "--shared", repo, cwd], {
    stdio: "pipe",
  })
  head = identity(cwd).head
})
afterEach(() => {
  for (const child of owned.splice(0)) {
    try {
      process.kill(-child, "SIGKILL")
    } catch {}
    try {
      process.kill(child, "SIGKILL")
    } catch {}
  }
  rmSync(cwd, { recursive: true, force: true })
})
function script(code) {
  return [process.execPath, "--input-type=module", "--eval", code]
}
function options(command, extra = {}) {
  return {
    cwd,
    gate: "fixture",
    command,
    exact: false,
    timeoutMs: 2000,
    graceMs: 100,
    ...extra,
  }
}
async function until(predicate, timeout = 5000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeout)
      throw new Error("Fixture did not reach expected state")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
function attempts() {
  const root = join(cwd, ".hermes/execution/chardin/release", head)
  return existsSync(root)
    ? readdirSync(root).map((name) => join(root, name))
    : []
}
function live(pid) {
  try {
    return !readFileSync(`/proc/${pid}/stat`, "utf8")
      .split(") ")[1]
      .startsWith("Z")
  } catch {
    return false
  }
}
function harness(command, extra = {}) {
  const code = `import { runEvidence } from ${JSON.stringify(runner)};
    const result = await runEvidence(${JSON.stringify(options(command, extra))});
    process.exitCode = result.exitCode;`
  const child = spawn(
    process.execPath,
    ["--input-type=module", "--eval", code],
    {
      cwd,
      env: { ...process.env, CHARDIN_PR_HEAD: head },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  owned.push(child.pid)
  let output = ""
  child.stdout.on("data", (data) => {
    output += data
  })
  child.stderr.on("data", (data) => {
    output += data
  })
  const closed = new Promise((resolve) =>
    child.on("close", (code, signal) => resolve({ code, signal, output })),
  )
  return { child, closed }
}

it("detects untracked source even when user Git configuration hides it", () => {
  execFileSync("git", ["config", "status.showUntrackedFiles", "no"], { cwd })
  writeFileSync(
    join(cwd, "src/app/hidden-review-input.ts"),
    "export const extra = true\n",
  )
  expect(
    execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
    }).trim(),
  ).toBe("")
  expect(identity(cwd).dirty).toBe(true)
  expect(() => requireExactHead(identity(cwd))).toThrow(/clean worktree/)
})

it("streams before exit and preserves failed first-attempt artifacts across reruns", async () => {
  const command =
    script(`import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
    import { join } from 'node:path';
    const dir = process.env.CHARDIN_EVIDENCE_DIR;
    for (const file of ['started.json', 'command.started.json', 'command.stdout.log', 'command.stderr.log'])
      if (!existsSync(join(dir, file))) throw new Error('missing pre-spawn record');
    mkdirSync(join(dir, 'coverage'));
    writeFileSync(join(dir, 'coverage/output.json'), '{"fixture":true}');
    console.log('retained failure'); process.exitCode = 7;`)
  const first = await runEvidence(options(command))
  expect(first.exitCode).toBe(7)
  expect(readAttempt(first.dir).runs[0].code).toBe(7)
  const original = inventory(first.dir)
  const next = await runEvidence(options(script("console.log('success')")))
  expect(next.exitCode).toBe(0)
  expect(inventory(first.dir)).toEqual(original)
  expect(
    JSON.parse(readRegular(first.dir, "manifest.json")).artifacts.map(
      (a) => a.path,
    ),
  ).toContain("coverage/output.json")
})

it("finalizes missing-executable errors as nonzero evidence", async () => {
  const result = await runEvidence(options([join(cwd, "no-executable")]))
  expect(result.exitCode).not.toBe(0)
  expect(readAttempt(result.dir).runs[0].spawnError).toBe("ENOENT")
})

it.each([
  ["SIGINT", false],
  ["SIGTERM", false],
  ["SIGTERM", true],
])(
  "handles %s and kills an uncooperative descendant after its leader closes (detached=%s)",
  async (signal, detached) => {
    const descendant = `import { writeFileSync } from 'node:fs';
    process.on('SIGTERM', () => {}); process.on('SIGINT', () => {});
    writeFileSync(${JSON.stringify(join(cwd, ".hermes/descendant"))}, String(process.pid));
    setInterval(() => {}, 100);`
    const command = script(`import { spawn } from 'node:child_process';
    process.on('SIGTERM', () => process.exit(0));
    spawn(process.execPath, ['--input-type=module', '--eval', ${JSON.stringify(descendant)}], { stdio: 'ignore', detached: ${detached} });
    console.log('sanitized partial token=do-not-retain'); setInterval(() => {}, 100);`)
    const { child, closed } = harness(command)
    await until(() => existsSync(join(cwd, ".hermes/descendant")))
    const descendantPid = Number(
      readFileSync(join(cwd, ".hermes/descendant"), "utf8"),
    )
    owned.push(descendantPid)
    const dir = attempts()[0]
    expect(readAttempt(dir).status).toBe("incomplete")
    expect(readRegular(dir, "command.stdout.log").toString()).toContain(
      "token=[REDACTED]",
    )
    expect(readRegular(dir, "command.stdout.log").toString()).not.toContain(
      "do-not-retain",
    )
    child.kill(signal)
    const result = await closed
    expect(result.code, result.output).toBe(signal === "SIGINT" ? 130 : 143)
    await until(() => !existsSync(`/proc/${descendantPid}`))
    const record = readAttempt(dir)
    expect(record.status).toBe("interrupted")
    expect(record.interrupted).toBe(signal)
    expect(record.runs[0].code).toBe(0) // Cannot turn a cancelling leader's 0 into pass.
  },
)

it("cleans surviving descendants even when the direct child exits successfully", async () => {
  const descendant = `import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => {});
    writeFileSync(${JSON.stringify(join(cwd, ".hermes/descendant"))}, String(process.pid)); setInterval(() => {}, 100);`
  const result = await runEvidence(
    options(
      script(`import { spawn } from 'node:child_process'; import { existsSync } from 'node:fs';
    const child = spawn(process.execPath, ['--input-type=module', '--eval', ${JSON.stringify(descendant)}], { stdio: 'ignore' }); child.unref();
    const timer = setInterval(() => { if (existsSync(${JSON.stringify(join(cwd, ".hermes/descendant"))})) { clearInterval(timer); process.exit(0); } }, 10);`),
    ),
  )
  const pid = Number(readFileSync(join(cwd, ".hermes/descendant"), "utf8"))
  owned.push(pid)
  await until(() => !live(pid))
  expect(result.exitCode).toBe(0)
})

it("bounds timeouts and retains explicitly incomplete evidence after unhandleable termination", async () => {
  const command = script(
    "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 100)",
  )
  const timed = await runEvidence(options(command, { timeoutMs: 150 }))
  expect(timed.exitCode).toBe(124)
  expect(readAttempt(timed.dir).runs[0].timedOut).toBe(true)
  const { child, closed } = harness(command)
  await until(
    () =>
      attempts().length === 2 &&
      attempts().some(
        (dir) =>
          existsSync(join(dir, "command.process.json")) &&
          !existsSync(join(dir, "result.json")) &&
          readRegular(dir, "command.stdout.log").length > 0,
      ),
  )
  const dir = attempts().find((dir) => !existsSync(join(dir, "result.json")))
  const pid = JSON.parse(readRegular(dir, "command.process.json")).pid
  owned.push(pid) // Fallback cleanup if a regression defeats parent-death supervision.
  child.kill("SIGKILL")
  await closed
  expect(readAttempt(dir).status).toBe("incomplete")
  expect(readRegular(dir, "command.stdout.log").toString()).toContain("ready")
  await until(() => !live(pid))
})

it("rejects a config-hidden dirty checkout before spawn and tracked changes during a clean attempt", async () => {
  execFileSync("git", ["config", "status.showUntrackedFiles", "no"], { cwd })
  const source = join(cwd, "src/app/hidden-input.ts")
  writeFileSync(source, "export {}")
  const rejected = harness(script("console.log('must not spawn')"), {
    exact: true,
  })
  const rejection = await rejected.closed
  expect(rejection.code).not.toBe(0)
  expect(rejection.output).not.toContain("must not spawn\n")
  expect(attempts()).toHaveLength(0)
  rmSync(source)
  const changed = harness(
    script(
      "import { appendFileSync } from 'node:fs'; appendFileSync('README.md', '\\nfixture change');",
    ),
    { exact: true },
  )
  expect((await changed.closed).code).toBe(1)
  const record = readAttempt(attempts()[0])
  expect(record.before.dirty).toBe(false)
  expect(record.after.dirty).toBe(true)
  expect(record.runs[0].code).toBe(0)
  expect(record.status).toBe("fail")
})

it("binds coverage output and the real engine-membership check to each attempt", async () => {
  copyFileSync(
    join(repo, "scripts/check-engine-coverage.mjs"),
    join(cwd, "scripts/check-engine-coverage.mjs"),
  )
  const command =
    script(`import { execFileSync } from 'node:child_process'; import { mkdirSync, writeFileSync } from 'node:fs'; import { join, resolve } from 'node:path';
    const paths = execFileSync('git', ['ls-files', 'src/engine'], {encoding: 'utf8'}).trim().split('\\n').filter(path => path.endsWith('.ts') && !path.endsWith('.d.ts'));
    const dir = process.env.CHARDIN_COVERAGE_DIR;
    mkdirSync(dir);
    writeFileSync(join(dir, 'coverage-summary.json'), JSON.stringify(Object.fromEntries(paths.map(path => [resolve(path), {}]))));
    writeFileSync(join(dir, 'coverage-final.json'), '{}');
    writeFileSync(join(dir, 'index.html'), '<p>Coverage fixture</p>');`)
  const first = await runEvidence(options(command, { gate: "coverage" }))
  expect(first.exitCode).toBe(0)
  expect(readAttempt(first.dir).runs.map((run) => run.code)).toEqual([0, 0])
  const saved = inventory(first.dir)
  const second = await runEvidence(options(command, { gate: "coverage" }))
  expect(second.exitCode).toBe(0)
  expect(inventory(first.dir)).toEqual(saved)
  expect(saved.map((item) => item.path)).toContain("coverage/index.html")
})

it("reaps a double-forked descendant that left the original session", async () => {
  const command = script(`import { spawn } from 'node:child_process';
    const grandchild = "import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => {}); writeFileSync(" + ${JSON.stringify(JSON.stringify(join(cwd, ".hermes/double-fork")))} + ", String(process.pid)); setInterval(() => {}, 100)";
    const intermediate = "import { spawn } from 'node:child_process'; import { existsSync } from 'node:fs'; const child = spawn(process.execPath, ['--input-type=module', '--eval', " + JSON.stringify(grandchild) + "], {detached:true, stdio:'ignore'}); child.unref(); const timer=setInterval(() => {if(existsSync(" + ${JSON.stringify(JSON.stringify(join(cwd, ".hermes/double-fork")))} + ")) {clearInterval(timer);process.exit(0)}},10)";
    spawn(process.execPath, ['--input-type=module', '--eval', intermediate], { stdio: 'ignore' });`)
  const result = await runEvidence(options(command))
  expect(result.exitCode).toBe(0)
  const pid = Number(readFileSync(join(cwd, ".hermes/double-fork"), "utf8"))
  owned.push(pid)
  await until(() => !live(pid))
})
