// @vitest-environment node
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterAll, beforeAll, expect, it } from "vitest"
import {
  evaluateAudit,
  evaluateHighAudit,
} from "../../../scripts/lib/evidence-audit.mjs"
import { runEvidence } from "../../../scripts/lib/evidence-runner.mjs"
import { sha256 } from "../../../scripts/lib/evidence.mjs"
import {
  readAttempt,
  readRegular,
} from "../../../scripts/lib/evidence-store.mjs"

// Synthetic advisories: no registry request or claim about actual dependencies.
function report(severity = "moderate") {
  return {
    actions: [{ action: "update", module: "fixture-package", target: "2.0.0" }],
    advisories: {
      123: {
        id: 123,
        github_advisory_id: "GHSA-fixture-only-0001",
        severity,
        module_name: "fixture-package",
        title: "Synthetic advisory",
        vulnerable_versions: "<2.0.0",
        patched_versions: ">=2.0.0",
        recommendation: "Upgrade to 2.0.0",
        findings: [
          {
            version: "1.0.0",
            paths: [
              "project>parent>fixture-package",
              "project>fixture-package",
            ],
          },
        ],
      },
    },
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        [severity]: 1,
      },
    },
  }
}
const result = (code) => ({
  code,
  exitCode: code,
  signal: null,
  spawnError: null,
  timedOut: false,
  interrupted: null,
})
const lock = "a".repeat(64)
const remediated = (lockSha256 = lock) => ({
  entries: {
    "GHSA-fixture-only-0001": {
      decision: "remediated",
      reason: "Synthetic package upgraded to its patched version 2.0.0",
      owner: "fixture reviewer",
      reviewedAt: "2026-09-08T00:00:00.000Z",
      lockSha256,
    },
  },
})
function cleanReport() {
  const clean = report()
  clean.advisories = {}
  clean.metadata.vulnerabilities.moderate = 0
  return clean
}
it("retains IDs, affected versions, every dependency path/fix and explicit unresolved moderate dispositions", () => {
  const data = evaluateAudit(report(), result(1), { entries: {} }, lock)
  expect(data.highCriticalStatus).toBe("pass")
  expect(data.moderateStatus).toBe("unresolved")
  expect(data.commandExit).toBe(1)
  expect(data.findings[0]).toMatchObject({
    id: "GHSA-fixture-only-0001",
    advisory: report().advisories[123],
    disposition: { decision: "unresolved", lockSha256: lock },
  })
})
it("requires advisory-specific reviewed dispositions bound to the exact lockfile", () => {
  const disposition = {
    decision: "deferred",
    reason: "Synthetic fixture only; owner accepted test risk",
    owner: "fixture reviewer",
    reviewedAt: "2026-09-08",
    lockSha256: lock,
  }
  const entries = { "GHSA-fixture-only-0001": disposition }
  expect(
    evaluateAudit(report(), result(1), { entries }, lock).findings[0]
      .disposition,
  ).toEqual(disposition)
  expect(() =>
    evaluateAudit(report(), result(1), { entries }, "other-lock"),
  ).toThrow(/different lockfile/)
  expect(() =>
    evaluateAudit(
      report(),
      result(1),
      { entries: { "GHSA-fixture-only-0001": { decision: "accepted" } } },
      lock,
    ),
  ).toThrow(/invalid/)
})
it.each(["high", "critical"])("keeps %s findings failing", (severity) => {
  expect(
    evaluateAudit(report(severity), result(1), { entries: {} }, lock)
      .highCriticalStatus,
  ).toBe("fail")
})
it.each(["info", "low", "moderate", "high", "critical"])(
  "rejects a remediated advisory still present at %s severity",
  (severity) => {
    expect(() =>
      evaluateAudit(report(severity), result(1), remediated(), lock),
    ).toThrow(/GHSA-fixture-only-0001 claims remediated but remains present/)
  },
)
it("accepts an absent remediation only with complete review metadata for this lockfile", () => {
  expect(
    evaluateAudit(cleanReport(), result(0), remediated(), lock),
  ).toMatchObject({
    findings: [],
    highCriticalStatus: "pass",
    moderateStatus: "reviewed",
  })
  expect(() =>
    evaluateAudit(cleanReport(), result(0), remediated(), "other-lock"),
  ).toThrow(/different lockfile/)
  for (const field of ["reason", "owner", "reviewedAt", "lockSha256"]) {
    const missing = remediated()
    delete missing.entries["GHSA-fixture-only-0001"][field]
    expect(() =>
      evaluateAudit(cleanReport(), result(0), missing, lock),
    ).toThrow(/invalid/)
  }
  const unrelated = report()
  unrelated.advisories[123].github_advisory_id = "GHSA-fixture-only-0002"
  expect(
    evaluateAudit(unrelated, result(1), remediated(), lock).moderateStatus,
  ).toBe("unresolved")
})
it("fails closed on filtered details, malformed schema, command errors and inconsistent exits", () => {
  const filtered = { ...report(), advisories: {} }
  expect(() => evaluateAudit(filtered, result(0), {}, lock)).toThrow(/counts/)
  expect(() =>
    evaluateAudit({ error: "registry unavailable" }, result(1), {}, lock),
  ).toThrow()
  expect(() => evaluateAudit(report(), result(2), {}, lock)).toThrow(
    /command failed/,
  )
  expect(() => evaluateAudit(report(), result(0), {}, lock)).toThrow(
    /command failed/,
  )
  const missing = report()
  missing.advisories[123].findings = []
  expect(() => evaluateAudit(missing, result(1), {}, lock)).toThrow(
    /paths or fix/,
  )
})

let cwd
beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), "chardin audit "))
  execFileSync("git", ["clone", "--quiet", "--shared", resolve("."), cwd], {
    stdio: "pipe",
  })
  writeFileSync(
    join(cwd, "docs/audit-dispositions.json"),
    JSON.stringify({ entries: {} }),
  )
})
afterAll(() => rmSync(cwd, { recursive: true, force: true }))
function command(value, exit) {
  return [
    process.execPath,
    "--eval",
    `console.log(${JSON.stringify(JSON.stringify(value))}); process.exitCode = ${exit}`,
  ]
}
it.each([true, false])(
  "enforces remediation presence through the audit runner (present: %s)",
  async (present) => {
    writeFileSync(
      join(cwd, "docs/audit-dispositions.json"),
      JSON.stringify(remediated(sha256(readRegular(cwd, "pnpm-lock.yaml")))),
    )
    try {
      const run = await runEvidence({
        cwd,
        gate: "audit",
        command: command(cleanReport(), 0),
        auditCommand: command(
          present ? report() : cleanReport(),
          present ? 1 : 0,
        ),
        exact: false,
        timeoutMs: 2000,
        graceMs: 100,
      })
      expect(run.exitCode).toBe(present ? 1 : 0)
      const record = readAttempt(run.dir)
      expect(record.status).toBe(present ? "fail" : "pass")
      expect(record.runs.map((run) => run.code)).toEqual([0, present ? 1 : 0])
      if (present)
        expect(record.error).toMatch(/claims remediated but remains present/)
      else expect(record.error).toBeNull()
    } finally {
      writeFileSync(
        join(cwd, "docs/audit-dispositions.json"),
        JSON.stringify({ entries: {} }),
      )
    }
  },
)
it.each([
  ["moderate findings", 0, report(), 1, 0],
  ["high command fails", 9, report(), 1, 9],
  ["detail command error", 0, report(), 2, 2],
  ["critical in detailed report", 0, report("critical"), 1, 1],
  ["registry failure", 0, { error: "offline fixture" }, 1, 1],
])(
  "persists both audit command exits and reports: %s",
  async (_, highExit, details, detailedExit, expected) => {
    const high = { ...report(), advisories: {} }
    const run = await runEvidence({
      cwd,
      gate: "audit",
      command: command(high, highExit),
      auditCommand: command(details, detailedExit),
      exact: false,
      timeoutMs: 2000,
      graceMs: 100,
    })
    expect(run.exitCode).toBe(expected)
    const record = readAttempt(run.dir)
    expect(record.runs.map((run) => run.code)).toEqual([highExit, detailedExit])
    expect(JSON.parse(readRegular(run.dir, "audit-all.json"))).toEqual(details)
    expect(JSON.parse(readRegular(run.dir, "audit-high.json"))).toEqual(high)
    if (expected === 0)
      expect(
        JSON.parse(readRegular(run.dir, "audit-dispositions.json"))
          .moderateStatus,
      ).toBe("unresolved")
  },
)

it("rejects high-severity counts hidden by filtering, even with a zero command exit", () => {
  expect(evaluateHighAudit(report("critical"))).toBe("fail")
  expect(() =>
    evaluateHighAudit({ ...report("high"), advisories: {} }),
  ).toThrow(/counts/)
  expect(() => evaluateHighAudit({ error: "failure" })).toThrow(/Invalid/)
})

it("preserves full raw audit JSON independently of log sanitization", async () => {
  const details = report()
  details.advisories[123].title =
    "An example token=synthetic is package advisory data"
  details.advisories[123].overview = "long package advisory detail ".repeat(
    3000,
  )
  const run = await runEvidence({
    cwd,
    gate: "audit",
    command: command({ ...report(), advisories: {} }, 0),
    auditCommand: command(details, 1),
    exact: false,
    timeoutMs: 2000,
    graceMs: 100,
  })
  expect(run.exitCode).toBe(0)
  expect(JSON.parse(readRegular(run.dir, "audit-all.json"))).toEqual(details)
  expect(readAttempt(run.dir).audit.findings[0].advisory.overview).toBe(
    details.advisories[123].overview,
  )
})
