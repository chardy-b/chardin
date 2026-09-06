import { describe, expect, it, vi } from "vitest"

import { createFixedStepLoop } from "@/engine/core/fixed-step-loop"

function harness(options?: {
  maxSubSteps?: number
  beforeFrame?: () => void
  onSimulate?: () => void
}) {
  let now = 0
  let nextId = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const simulate = vi.fn(() => options?.onSimulate?.())
  const render = vi.fn()
  const cancelFrame = vi.fn((id: number) => callbacks.delete(id))
  const loop = createFixedStepLoop({
    fixedSeconds: 1 / 60,
    maxFrameSeconds: 0.1,
    maxSubSteps: options?.maxSubSteps,
    simulate,
    render,
    now: () => now,
    requestFrame: (callback) => {
      const id = ++nextId
      callbacks.set(id, callback)
      return id
    },
    cancelFrame,
    beforeFrame: options?.beforeFrame,
  })

  return {
    loop,
    simulate,
    render,
    cancelFrame,
    frame(milliseconds: number) {
      now += milliseconds
      const [[id, callback]] = callbacks
      callbacks.delete(id)
      callback(now)
    },
    advance(milliseconds: number) {
      now += milliseconds
    },
    pending: () => callbacks.size,
  }
}

describe("fixed step loop", () => {
  it.each([30, 60, 120])("has the same outcome at %i Hz", (hz) => {
    const clock = harness()
    clock.loop.start()
    for (let frame = 0; frame < hz; frame += 1) clock.frame(1000 / hz)

    expect(clock.simulate).toHaveBeenCalledTimes(60)
    expect(clock.simulate).toHaveBeenCalledWith(1 / 60)
    expect(clock.render.mock.calls.at(-1)?.[0]).toBeGreaterThanOrEqual(0)
    expect(clock.render.mock.calls.at(-1)?.[0]).toBeLessThan(1)
  })

  it("clamps long gaps and bounds catch-up work", () => {
    const clock = harness({ maxSubSteps: 4 })
    clock.loop.start()
    clock.frame(10_000)

    expect(clock.simulate).toHaveBeenCalledTimes(4)
    expect(clock.render.mock.calls.at(-1)?.[0]).toBeGreaterThanOrEqual(0)
    expect(clock.render.mock.calls.at(-1)?.[0]).toBeLessThan(1)
  })

  it("pauses without catch-up and keeps one request active", () => {
    const clock = harness()
    clock.loop.start()
    clock.loop.start()
    expect(clock.pending()).toBe(1)

    clock.frame(20)
    clock.loop.pause()
    expect(clock.pending()).toBe(0)
    clock.advance(5_000)
    clock.loop.resume()
    clock.frame(0)

    expect(clock.simulate).toHaveBeenCalledTimes(1)
    expect(clock.pending()).toBe(1)
  })

  it("does not render or reschedule when simulation pauses re-entrantly", () => {
    const clock = harness({ onSimulate: () => clock.loop.pause() })
    clock.loop.start()
    clock.frame(20)

    expect(clock.simulate).toHaveBeenCalledOnce()
    expect(clock.render).not.toHaveBeenCalled()
    expect(clock.pending()).toBe(0)
  })

  it("samples external state once per rendered frame, not per substep", () => {
    const beforeFrame = vi.fn()
    const clock = harness({ beforeFrame })
    clock.loop.start()
    clock.frame(100)

    expect(clock.simulate).toHaveBeenCalledTimes(6)
    expect(beforeFrame).toHaveBeenCalledOnce()
  })

  it("cleans up once and cannot restart", () => {
    const clock = harness()
    clock.loop.start()
    clock.loop.dispose()
    clock.loop.dispose()
    clock.loop.resume()

    expect(clock.cancelFrame).toHaveBeenCalledOnce()
    expect(clock.pending()).toBe(0)
  })
})
