import { join } from "node:path"
import { identity, requireExactHead, sha256 } from "./evidence.mjs"
import {
  finalizeAttempt,
  readRegular,
  reserveAttempt,
  safeDirectory,
  writeExclusive,
  writeJson,
} from "./evidence-store.mjs"
import { processOwner } from "./evidence-process.mjs"
import { evaluateAudit, evaluateHighAudit } from "./evidence-audit.mjs"

export async function runEvidence({
  gate,
  command,
  cwd = process.cwd(),
  timeoutMs = 15 * 60_000,
  graceMs = 5000,
  exact = true,
  auditCommand = null,
}) {
  const before = identity(cwd)
  if (exact) requireExactHead(before)
  const lockSha256 = sha256(readRegular(cwd, "pnpm-lock.yaml"))
  const owner = processOwner({ graceMs })
  let dir
  try {
    dir = reserveAttempt({
      cwd,
      head: before.head,
      gate,
      metadata: { before, command, lockSha256, exact },
    })
    const env = {
      ...process.env,
      CHARDIN_PLAYWRIGHT_DIR: "",
      NEXT_PUBLIC_E2E_HOOKS: "false",
      CHARDIN_EVIDENCE_DIR: dir,
      CHARDIN_COVERAGE_DIR: join(dir, "coverage"),
    }
    const deadline = Date.now() + timeoutMs
    const remainingMs = () => Math.max(1, deadline - Date.now())
    const runs = []
    let error = null
    let audit = null
    try {
      runs.push(
        await owner.run({
          command,
          cwd,
          env,
          dir,
          name: "command",
          timeoutMs: remainingMs(),
          scanner: gate === "secrets",
          jsonPath: gate === "audit" ? "audit-high.json" : null,
        }),
      )
      if (gate === "coverage" && !owner.interrupted && runs[0].exitCode === 0) {
        runs.push(
          await owner.run({
            command: [process.execPath, "scripts/check-engine-coverage.mjs"],
            cwd,
            env,
            dir,
            name: "coverage-membership",
            timeoutMs: remainingMs(),
          }),
        )
      }
      if (
        ["browser", "performance", "production"].includes(gate) &&
        !owner.interrupted
      ) {
        JSON.parse(readRegular(dir, "playwright/reporter.json"))
        const reporter = JSON.parse(
          readRegular(dir, "playwright/reporter-result.json"),
        )
        if (reporter.status !== "passed")
          throw new Error("Browser reporter did not pass")
        JSON.parse(readRegular(dir, "playwright/attachments.json"))
      }
      if (gate === "coverage" && runs[0].exitCode === 0) {
        JSON.parse(readRegular(dir, "coverage/coverage-summary.json"))
        JSON.parse(readRegular(dir, "coverage/coverage-final.json"))
      }
      if (gate === "audit" && !owner.interrupted) {
        const detailed = await owner.run({
          command: auditCommand,
          cwd,
          env,
          dir,
          name: "audit-all",
          jsonPath: "audit-all.json",
          timeoutMs: remainingMs(),
        })
        runs.push(detailed)
        const raw = readRegular(dir, "audit-all.json")
        const highStatus = evaluateHighAudit(
          JSON.parse(readRegular(dir, "audit-high.json")),
        )
        audit = evaluateAudit(
          JSON.parse(raw),
          detailed,
          JSON.parse(readRegular(cwd, "docs/audit-dispositions.json")),
          lockSha256,
        )
        if (highStatus === "fail") audit.highCriticalStatus = "fail"
        writeJson(dir, "audit-dispositions.json", audit)
      }
    } catch (failure) {
      error = failure.message
    }
    let after = null
    try {
      after = identity(cwd)
    } catch {
      error ??= "Unable to read final Git identity"
    }
    const unchanged =
      after &&
      !after.dirty &&
      after.head === before.head &&
      after.tree === before.tree
    let exitCode = owner.interrupted
      ? owner.interrupted === "SIGINT"
        ? 130
        : 143
      : (runs[0]?.exitCode ?? 1)
    if (gate !== "audit")
      exitCode ||= runs.find((run) => run.exitCode !== 0)?.exitCode ?? 0
    else if (error) exitCode ||= runs[1]?.exitCode || 1
    if (
      error ||
      (exact && !unchanged) ||
      (gate !== "audit" && runs.some((run) => run.exitCode !== 0)) ||
      audit?.highCriticalStatus === "fail"
    )
      exitCode ||= 1
    if (gate === "build" && exitCode === 0) {
      try {
        const stamp = {
          ...before,
          hooks: false,
          buildId: readRegular(cwd, ".next/BUILD_ID").toString().trim(),
          recordedAt: new Date().toISOString(),
        }
        writeJson(dir, "build-stamp.json", stamp)
        safeDirectory(join(cwd, ".next"))
        // This working-build pointer is replaceable; the attempt copy is immutable.
        // Remove/recreate is owned by Next build. Refuse existing/symlink targets.
        writeExclusive(
          cwd,
          ".next/chardin-build-evidence.json",
          JSON.stringify(stamp),
        )
      } catch (failure) {
        error = failure.message
        exitCode = 1
      }
    }
    const result = {
      gate,
      before,
      after,
      exact,
      lockSha256,
      runs,
      error,
      audit,
      interrupted: owner.interrupted,
      exitCode,
      status: owner.interrupted
        ? "interrupted"
        : exitCode === 0
          ? "pass"
          : "fail",
    }
    finalizeAttempt(dir, result)
    return { dir, ...result }
  } finally {
    owner.close()
  }
}
