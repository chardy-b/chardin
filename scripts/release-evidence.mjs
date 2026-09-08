import { runEvidence } from "./lib/evidence-runner.mjs"
import { PERFORMANCE_TIMEOUTS } from "./lib/performance-workload.mjs"

import { commands } from "./lib/evidence-commands.mjs"
const gate = process.argv[2]
if (!Object.hasOwn(commands, gate))
  throw new Error(`Choose one gate: ${Object.keys(commands).join(", ")}`)
const result = await runEvidence({
  gate,
  command: commands[gate],
  timeoutMs:
    gate === "performance" ? PERFORMANCE_TIMEOUTS.runnerMs : 15 * 60_000,
  auditCommand: [
    "pnpm",
    "audit",
    "--audit-level=info",
    "--json",
    "--ignore-registry-errors=false",
  ],
})
process.stdout.write(`Evidence: ${result.dir}\n`)
process.exitCode = result.exitCode
