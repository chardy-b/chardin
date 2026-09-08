import { describe, expect, it, vi } from "vitest"

import { createExperience } from "@/engine/create-experience"

describe("createExperience", () => {
  it("reports WebGL2 absence without creating a renderer", () => {
    const onState = vi.fn()
    const createRuntime = vi.fn()
    const canvas = document.createElement("canvas")

    const experience = createExperience({
      canvas,
      onState,
      getWebGL2Context: () => null,
      createRuntime,
    })

    expect(onState).toHaveBeenLastCalledWith({
      status: "failed",
      code: "webgl2",
    })
    expect(createRuntime).not.toHaveBeenCalled()
    expect(experience.start()).toBe(false)
  })

  it("starts, pauses, resumes, and disposes a runtime once", () => {
    const runtime = {
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      dispose: vi.fn(),
    }
    const onState = vi.fn()
    const canvas = document.createElement("canvas")
    const context = {} as WebGL2RenderingContext

    const experience = createExperience({
      canvas,
      onState,
      getWebGL2Context: () => context,
      createRuntime: () => runtime,
    })

    expect(onState.mock.calls.map(([state]) => state.status)).toEqual([
      "checking",
      "loading",
      "ready",
    ])
    expect(experience.start()).toBe(true)
    expect(experience.start()).toBe(false)
    experience.pause()
    experience.resume()
    experience.resume()
    experience.dispose()
    experience.dispose()

    expect(runtime.start).toHaveBeenCalledOnce()
    expect(runtime.pause).toHaveBeenCalledOnce()
    expect(runtime.resume).toHaveBeenCalledOnce()
    expect(runtime.dispose).toHaveBeenCalledOnce()
    expect(onState).toHaveBeenLastCalledWith({ status: "disposed" })
  })

  it("converts initialization errors into a safe runtime failure", () => {
    const onState = vi.fn()

    createExperience({
      canvas: document.createElement("canvas"),
      onState,
      getWebGL2Context: () => ({}) as WebGL2RenderingContext,
      createRuntime: () => {
        throw new Error("driver details")
      },
    })

    expect(onState).toHaveBeenLastCalledWith({
      status: "failed",
      code: "runtime",
    })
  })
})
