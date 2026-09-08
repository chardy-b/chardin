import { expect, it, vi } from "vitest"
import { createResourceScope } from "@/engine/core/resource-scope"
it("releases partial construction in reverse order, once, even if cleanup throws", () => {
  const scope = createResourceScope()
  const calls: number[] = []
  const last = vi.fn(() => {
    calls.push(2)
    throw new Error("driver")
  })
  scope.defer(() => {
    calls.push(1)
  })
  scope.defer(last)
  scope.dispose()
  scope.dispose()
  expect(calls).toEqual([2, 1])
  expect(last).toHaveBeenCalledOnce()
})
