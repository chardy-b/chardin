/** Nearest-rank percentiles: never drop stalls or invalid samples silently. */
export function summarize(values, budget, statistic = "p95") {
  if (statistic !== "p95" && statistic !== "max")
    throw new Error("Unknown budget statistic")
  if (!values.length || values.some((n) => !Number.isFinite(n) || n < 0))
    throw new Error("Expected nonempty finite, nonnegative measurements")
  if (budget !== null && (!Number.isFinite(budget) || budget <= 0))
    throw new Error("Budget must be positive or explicitly pending (null)")
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (p) => sorted[Math.ceil(p * sorted.length) - 1]
  return {
    statistic,
    samples: sorted.length,
    median: rank(0.5),
    p95: rank(0.95),
    p99: rank(0.99),
    max: sorted.at(-1),
    budget,
    overBudget:
      budget === null ? null : values.filter((n) => n > budget).length,
    status:
      budget === null
        ? "budget-pending"
        : (statistic === "max" ? sorted.at(-1) : rank(0.95)) <= budget
          ? "pass"
          : "fail",
  }
}
