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

it("waits for actual readiness and ignores stale completion after disposal", async () => {
  let resolve!: () => void
  const ready = new Promise<void>((done) => {
    resolve = done
  })
  const onState = vi.fn()
  const runtime = {
    ready,
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  }
  const experience = createExperience({
    canvas: document.createElement("canvas"),
    onState,
    getWebGL2Context: () => ({}) as WebGL2RenderingContext,
    createRuntime: () => runtime,
  })
  expect(onState).toHaveBeenLastCalledWith({ status: "loading", progress: 0 })
  expect(experience.start()).toBe(false)
  experience.dispose()
  resolve()
  await ready
  expect(onState).toHaveBeenLastCalledWith({ status: "disposed" })
})

it("contains start failures, disposes ownership, and retries behind a new gesture", () => {
  const onState = vi.fn()
  const broken = {
    start: vi.fn(() => {
      throw new Error("driver")
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  }
  const healthy = {
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  }
  const createRuntime = vi
    .fn()
    .mockReturnValueOnce(broken)
    .mockReturnValue(healthy)
  const experience = createExperience({
    canvas: document.createElement("canvas"),
    onState,
    getWebGL2Context: () => ({}) as WebGL2RenderingContext,
    createRuntime,
  })
  expect(experience.start()).toBe(false)
  expect(onState).toHaveBeenLastCalledWith({
    status: "failed",
    code: "runtime",
  })
  expect(broken.dispose).toHaveBeenCalledOnce()
  experience.retry()
  expect(onState).toHaveBeenLastCalledWith({ status: "ready" })
  expect(healthy.start).not.toHaveBeenCalled()
  expect(experience.start()).toBe(true)
  experience.dispose()
})

it("pauses on context loss and rebuilds on restore without silently running", () => {
  const canvas = document.createElement("canvas")
  const onState = vi.fn()
  const instances = Array.from({ length: 2 }, () => ({
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  }))
  const factory = vi
    .fn()
    .mockReturnValueOnce(instances[0])
    .mockReturnValue(instances[1])
  const experience = createExperience({
    canvas,
    onState,
    getWebGL2Context: () => ({}) as WebGL2RenderingContext,
    createRuntime: factory,
  })
  experience.start()
  const lost = new Event("webglcontextlost", { cancelable: true })
  canvas.dispatchEvent(lost)
  expect(lost.defaultPrevented).toBe(true)
  expect(onState).toHaveBeenLastCalledWith({ status: "context-lost" })
  expect(instances[0].dispose).toHaveBeenCalledOnce()
  canvas.dispatchEvent(new Event("webglcontextrestored"))
  expect(onState).toHaveBeenLastCalledWith({ status: "recovered" })
  expect(instances[1].start).not.toHaveBeenCalled()
  experience.resume()
  expect(instances[1].start).toHaveBeenCalledOnce()
  experience.dispose()
  canvas.dispatchEvent(new Event("webglcontextrestored"))
  expect(factory).toHaveBeenCalledTimes(2)
})

it("does not overwrite a synchronous start failure callback with running", () => {
  const onState = vi.fn()
  let fatal!: () => void
  const runtime = {
    start: () => fatal(),
    pause: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  }
  const experience = createExperience({
    canvas: document.createElement("canvas"),
    onState,
    getWebGL2Context: () => ({}) as WebGL2RenderingContext,
    createRuntime: (_canvas, _context, options) => {
      fatal = options!.onFatal!
      return runtime
    },
  })
  expect(experience.start()).toBe(false)
  expect(onState).toHaveBeenLastCalledWith({
    status: "failed",
    code: "runtime",
  })
  experience.dispose()
})

it("keeps repeated Retry during context loss recoverable and waits for a fresh gesture", () => {
  let lost = false
  const canvas = document.createElement("canvas")
  const onState = vi.fn()
  const runtime = () => ({
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  })
  const first = runtime()
  const restored = runtime()
  const factory = vi.fn(() => {
    if (lost) throw new Error("context is still lost")
    return factory.mock.calls.length === 1 ? first : restored
  })
  const experience = createExperience({
    canvas,
    onState,
    getWebGL2Context: () =>
      ({ isContextLost: () => lost }) as WebGL2RenderingContext,
    createRuntime: factory,
  })
  experience.start()
  lost = true
  canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
  for (let i = 0; i < 3; i++) experience.retry()
  expect(onState).toHaveBeenLastCalledWith({ status: "context-lost" })
  expect(factory).toHaveBeenCalledOnce()
  lost = false
  canvas.dispatchEvent(new Event("webglcontextrestored"))
  expect(onState).toHaveBeenLastCalledWith({ status: "recovered" })
  expect(restored.start).not.toHaveBeenCalled()
  experience.resume()
  expect(restored.start).toHaveBeenCalledOnce()
  experience.dispose()
})

it("generation-guards sky status, forwards commands and permits paused rebuild only for absent pavilion", () => {
  const canvas = document.createElement("canvas"),
    onState = vi.fn(),
    onSkyStatus = vi.fn()
  const instances: Array<{
    options: import("@/engine/contracts").RuntimeOptions
    skyCommand: ReturnType<typeof vi.fn>
  }> = []
  const experience = createExperience({
    canvas,
    onState,
    onSkyStatus,
    getWebGL2Context: () => ({}) as WebGL2RenderingContext,
    createRuntime: (_c, _g, options = {}) => {
      const runtime = {
        options,
        skyCommand: vi.fn(),
        start: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        dispose: vi.fn(),
      }
      instances.push(runtime)
      return runtime
    },
  })
  experience.start()
  experience.pause()
  experience.retry()
  expect(instances).toHaveLength(1)
  const status = {
    phase: "Settle",
    playback: "ready" as const,
    inside: false,
    viewingZone: false,
    viewing: false,
    available: false,
    scoreAvailable: true,
    reducedMotion: false,
  }
  instances[0]!.options.onSkyStatus!(status)
  experience.skyCommand("return-to-clearing")
  expect(instances[0]!.skyCommand).toHaveBeenCalledWith("return-to-clearing")
  experience.retry()
  expect(instances).toHaveLength(2)
  experience.start()
  instances[0]!.options.onPauseRequested!()
  expect(onState).toHaveBeenLastCalledWith({ status: "running" })
  onSkyStatus.mockClear()
  instances[0]!.options.onSkyStatus!(status)
  expect(onSkyStatus).not.toHaveBeenCalled()
  experience.dispose()
  instances[1]!.options.onSkyStatus!(status)
  expect(onSkyStatus).not.toHaveBeenCalled()
})

it.each([
  ["true", "/?e2e=1", true],
  ["true", "/", false],
  ["false", "/?e2e=1", false],
])(
  "sets immutable context preservation at creation only for manual mode (%s, %s)",
  (flag, url, preserved) => {
    vi.stubEnv("NEXT_PUBLIC_E2E_HOOKS", flag)
    window.history.replaceState({}, "", url)
    const canvas = document.createElement("canvas")
    const getContext = vi
      .spyOn(canvas, "getContext")
      .mockReturnValue({} as WebGL2RenderingContext)
    const experience = createExperience({
      canvas,
      onState: vi.fn(),
      createRuntime: () => ({
        start() {},
        pause() {},
        resume() {},
        dispose() {},
      }),
    })
    expect(getContext).toHaveBeenCalledExactlyOnceWith("webgl2", {
      preserveDrawingBuffer: preserved,
    })
    experience.dispose()
    vi.unstubAllEnvs()
    window.history.replaceState({}, "", "/")
  },
)
