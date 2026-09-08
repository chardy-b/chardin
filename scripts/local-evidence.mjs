import { commands } from "./lib/evidence-commands.mjs"
import { runEvidence } from "./lib/evidence-runner.mjs"
import { PERFORMANCE_TIMEOUTS } from "./lib/performance-workload.mjs"

const gate = process.argv[2]
if (!["coverage", "browser", "performance", "bundle"].includes(gate))
  throw new Error("Unknown local evidence gate")
const result = await runEvidence({
  gate,
  command: [...commands[gate], ...process.argv.slice(3)],
  exact: gate === "bundle",
  timeoutMs:
    gate === "performance" ? PERFORMANCE_TIMEOUTS.runnerMs : 15 * 60_000,
})
process.stdout.write(`Evidence: ${result.dir}\n`)
process.exitCode = result.exitCode
