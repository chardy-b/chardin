import { readFileSync } from "node:fs"

/** @returns {typeof import("../../docs/performance-budgets.json")} */
export function loadPerformanceBudgets() {
  // Native Node ESM must not depend on JSON import attributes or the runner's cwd.
  // Missing/malformed files throw; null limits remain pending in summarize().
  return JSON.parse(
    readFileSync(
      new URL("../../docs/performance-budgets.json", import.meta.url),
      "utf8",
    ),
  )
}
