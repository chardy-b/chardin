import * as THREE from "three"
import { beforeEach, expect, it, vi } from "vitest"
const harness = vi.hoisted(() => ({
  rendererDispose: vi.fn(),
  draw: vi.fn(),
  configure: vi.fn(),
  pipelineDispose: vi.fn(),
  travelerDispose: vi.fn(),
  travelerUpdate: vi.fn(),
  inputDispose: vi.fn(),
  inputClear: vi.fn(),
  onFrame: null as FrameRequestCallback | null,
  observer: null as (() => void) | null,
  media: null as (() => void) | null,
  reduced: false,
  failPipeline: false,
}))
vi.mock("three", async (original) => {
  const actual = await original<typeof import("three")>()
  return {
    ...actual,
    WebGLRenderer: class {
      dispose = harness.rendererDispose
      info = { memory: { geometries: 8, textures: 4 } }
    },
  }
})
vi.mock("@/engine/render/render-pipeline", () => ({
  createRenderPipeline: () => {
    if (harness.failPipeline) throw new Error("partial construction")
    return {
      ready: Promise.resolve(),
      configure: harness.configure,
      resize: vi.fn(),
      render: harness.draw,
      dispose: harness.pipelineDispose,
      setOutlineSignals: vi.fn(),
    }
  },
}))
vi.mock("@/engine/player/traveler-view", () => ({
  createTravelerView: () => ({
    object: new THREE.Group(),
    ready: Promise.resolve(),
    update: harness.travelerUpdate,
    dispose: harness.travelerDispose,
  }),
}))
vi.mock("@/engine/input/input-manager", () => ({
  InputManager: class {
    dispose = harness.inputDispose
    pause = harness.inputClear
    resume = harness.inputClear
    sample = () => ({
      move: { x: 0, y: 1 },
      look: { x: 0, y: 0 },
      jumpPressed: false,
      actionPressed: false,
      pausePressed: false,
      run: false,
    })
  },
}))
import { createThreeRuntime } from "@/engine/three-runtime"
beforeEach(() => {
  harness.failPipeline = false
  harness.reduced = false
  harness.draw.mockReset()
  vi.stubEnv("NEXT_PUBLIC_E2E_HOOKS", "true")
  window.history.replaceState({}, "", "/?e2e=1")
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return harness.reduced
      },
      addEventListener: (_: string, cb: () => void) => {
        harness.media = cb
      },
      removeEventListener: vi.fn(),
    })),
  )
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      constructor(cb: () => void) {
        harness.observer = cb
      }
    },
  )
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    harness.onFrame = callback
    return 1
  })
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
})
it("owns readiness, deterministic stepping, quality, live preferences and one disposal", async () => {
  const runtime = createThreeRuntime(
    document.createElement("canvas"),
    {} as WebGL2RenderingContext,
  )
  await runtime.ready
  const api = window.__CHARDIN_TEST__!
  api.step(60, { move: { x: 0, y: 1 } })
  expect(api.snapshot().distance).toBe(0)
  runtime.start()
  api.step(60, { move: { x: 0, y: 1 } })
  expect(api.snapshot().distance).toBeGreaterThan(1)
  runtime.pause()
  const position = api.snapshot().position
  api.step(60, { jumpPressed: true })
  expect(api.snapshot().position).toEqual(position)
  runtime.setQuality!("low")
  expect(api.snapshot().position).toEqual(position)
  expect(api.snapshot().quality).toBe("low")
  harness.reduced = true
  harness.media!()
  expect(api.snapshot().reducedMotion).toBe(true)
  runtime.resume()
  api.step(1, { jumpPressed: true })
  expect(api.snapshot().grounded).toBe(false)
  runtime.dispose()
  runtime.dispose()
  expect(harness.rendererDispose).toHaveBeenCalledOnce()
  expect(harness.pipelineDispose).toHaveBeenCalledOnce()
  expect(harness.travelerDispose).toHaveBeenCalledOnce()
  expect(harness.inputDispose).toHaveBeenCalledOnce()
  expect(window.__CHARDIN_TEST__).toBeUndefined()
})
it("cleans every successful owner when later construction fails", () => {
  harness.failPipeline = true
  expect(() =>
    createThreeRuntime(
      document.createElement("canvas"),
      {} as WebGL2RenderingContext,
    ),
  ).toThrow("partial construction")
  expect(harness.rendererDispose).toHaveBeenCalledOnce()
  expect(harness.travelerDispose).toHaveBeenCalledOnce()
  expect(harness.inputDispose).toHaveBeenCalledOnce()
})
it("contains render errors in a scheduled frame and removes the test API", async () => {
  window.history.replaceState({}, "", "/")
  const onFatal = vi.fn()
  const runtime = createThreeRuntime(
    document.createElement("canvas"),
    {} as WebGL2RenderingContext,
    { onFatal },
  )
  await runtime.ready
  runtime.start()
  runtime.start()
  expect(window.requestAnimationFrame).toHaveBeenCalledOnce()
  harness.draw.mockImplementationOnce(() => {
    throw new Error("driver")
  })
  harness.onFrame!(performance.now())
  expect(onFatal).toHaveBeenCalledOnce()
  expect(harness.rendererDispose).toHaveBeenCalledOnce()
  expect(window.__CHARDIN_TEST__).toBeUndefined()
  runtime.dispose()
  expect(harness.rendererDispose).toHaveBeenCalledOnce()
})

it("reports a resized frame only after drawing it and preserves paused simulation", async () => {
  const canvas = document.createElement("canvas")
  Object.defineProperties(canvas, {
    clientWidth: { value: 1280, configurable: true },
    clientHeight: { value: 720, configurable: true },
  })
  const runtime = createThreeRuntime(canvas, {} as WebGL2RenderingContext)
  await runtime.ready
  const api = window.__CHARDIN_TEST__!
  runtime.start()
  runtime.pause()
  const before = api.snapshot()
  expect(before.viewport).toEqual({ width: 1280, height: 720 })
  Object.defineProperties(canvas, {
    clientWidth: { value: 820, configurable: true },
    clientHeight: { value: 1180, configurable: true },
  })
  harness.observer!()
  expect(api.snapshot().viewport).toEqual({ width: 820, height: 1180 })
  expect(api.snapshot().position).toEqual(before.position)
  expect(api.snapshot().simulationTime).toBe(before.simulationTime)
  expect(api.snapshot().running).toBe(false)
  runtime.dispose()
})

it("keeps every startup draw at the selected Low render tier", async () => {
  const runtime = createThreeRuntime(
    document.createElement("canvas"),
    {} as WebGL2RenderingContext,
    { quality: "low" },
  )
  await runtime.ready
  expect(harness.configure).toHaveBeenCalled()
  expect(
    harness.configure.mock.calls.every(([quality]) => quality === "low"),
  ).toBe(true)
  runtime.dispose()
})

it("updates Idle state with zero animation time under reduced motion", async () => {
  harness.reduced = true
  const runtime = createThreeRuntime(
    document.createElement("canvas"),
    {} as WebGL2RenderingContext,
  )
  await runtime.ready
  runtime.start()
  const api = window.__CHARDIN_TEST__!
  api.step(1, { move: { x: 0, y: 1 } })
  harness.travelerUpdate.mockClear()
  api.step(1)
  expect(harness.travelerUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ locomotion: "idle" }),
    0,
  )
  runtime.dispose()
})
