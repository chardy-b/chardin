const severities = ["info", "low", "moderate", "high", "critical"]

export function evaluateAudit(report, commandResult, dispositions, lockSha256) {
  if (
    !report ||
    report.error ||
    !report.advisories ||
    Array.isArray(report.advisories)
  )
    throw new Error("Detailed audit report is missing advisories")
  const counts = report.metadata?.vulnerabilities
  if (
    !counts ||
    severities.some((s) => !Number.isInteger(counts[s]) || counts[s] < 0)
  )
    throw new Error("Detailed audit has invalid severity counts")
  const findings = Object.entries(report.advisories).map(([key, advisory]) => {
    if (
      !severities.includes(advisory.severity) ||
      !advisory.module_name ||
      !(advisory.github_advisory_id || advisory.id) ||
      !advisory.vulnerable_versions ||
      !Array.isArray(advisory.findings) ||
      !advisory.findings.length ||
      advisory.findings.some(
        (finding) =>
          !finding.version ||
          !Array.isArray(finding.paths) ||
          !finding.paths.length,
      ) ||
      !(
        Object.hasOwn(advisory, "patched_versions") ||
        Object.hasOwn(advisory, "patched_versions_unpublished")
      )
    )
      throw new Error(
        "Detailed audit lacks advisory identity, affected versions, paths or fix data",
      )
    const id = advisory.github_advisory_id ?? String(advisory.id)
    let disposition = null
    if (advisory.severity === "moderate") {
      const reviewed = dispositions?.entries?.[id]
      if (
        reviewed &&
        (!["deferred", "not-affected", "remediated", "unresolved"].includes(
          reviewed.decision,
        ) ||
          !reviewed.reason ||
          !reviewed.owner ||
          !reviewed.reviewedAt ||
          reviewed.lockSha256 !== lockSha256)
      )
        throw new Error(
          "Moderate disposition is invalid or bound to a different lockfile",
        )
      disposition = reviewed ?? {
        decision: "unresolved",
        owner: "release owner",
        reason:
          "Requires advisory-specific review; no risk acceptance is implied",
        lockSha256,
      }
    }
    return { key, id, advisory, disposition }
  })
  // Detect filtering/ignored findings: the full report must explain every count.
  for (const severity of severities)
    if (
      findings.filter((finding) => finding.advisory.severity === severity)
        .length !== counts[severity]
    )
      throw new Error("Detailed audit counts do not match retained advisories")
  const expectedExit = findings.length ? 1 : 0
  if (
    commandResult.exitCode !== expectedExit ||
    commandResult.signal ||
    commandResult.spawnError ||
    commandResult.timedOut ||
    commandResult.interrupted
  )
    throw new Error(
      "Detailed audit command failed independently of reported findings",
    )
  return {
    counts,
    commandExit: commandResult.code,
    expectedFindingExit: expectedExit,
    highCriticalStatus: counts.high + counts.critical ? "fail" : "pass",
    moderateStatus: findings.some(
      (f) => f.disposition?.decision === "unresolved",
    )
      ? "unresolved"
      : "reviewed",
    findings,
  }
}

export function evaluateHighAudit(report) {
  if (
    !report ||
    report.error ||
    !report.advisories ||
    !report.metadata?.vulnerabilities
  )
    throw new Error("Invalid high-threshold audit report")
  const counts = report.metadata.vulnerabilities
  for (const severity of ["high", "critical"])
    if (
      !Number.isInteger(counts[severity]) ||
      counts[severity] < 0 ||
      Object.values(report.advisories).filter((a) => a.severity === severity)
        .length !== counts[severity]
    )
      throw new Error(
        "High-threshold audit counts do not match retained advisories",
      )
  return counts.high + counts.critical ? "fail" : "pass"
}
