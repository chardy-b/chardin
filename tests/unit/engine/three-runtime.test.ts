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
  media: null as ((event: Pick<MediaQueryListEvent, "matches">) => void) | null,
  removeMedia: vi.fn(),
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
      applyLightFrame: vi.fn(),
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
      addEventListener: (_: string, cb: NonNullable<typeof harness.media>) => {
        harness.media = cb
      },
      removeEventListener: harness.removeMedia,
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
  harness.media!({ matches: true })
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

it("applies motion event snapshots to sky, animation and quality without frames or a live query read", async () => {
  const canvas = document.createElement("canvas")
  const onSkyStatus = vi.fn()
  const runtime = createThreeRuntime(canvas, {} as WebGL2RenderingContext, {
    onSkyStatus,
  })
  await runtime.ready
  const api = window.__CHARDIN_TEST__!
  const listener = harness.media!
  try {
    runtime.start()
    for (const point of [0, 1, 2, 3, 4]) walkToSkyspacePoint({ point })
    runtime.skyCommand!("start")
    api.step(30)
    runtime.setQuality!("low")
    const before = api.snapshot()
    // A change event carries its own snapshot. The getter is deliberately left
    // at the opposite value so this test cannot pass by re-reading the query.
    for (const reduced of [true, false, true, false]) {
      harness.reduced = !reduced
      const unchanged = api.snapshot()
      listener({ matches: reduced })
      expect(canvas.dataset.reducedMotion).toBe(String(reduced))
      expect(api.snapshot().reducedMotion).toBe(reduced)
      expect(api.snapshot().sky).toMatchObject({
        reducedMotion: reduced,
        tick: before.sky.tick,
        playback: reduced ? "still" : "paused",
      })
      expect(onSkyStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ reducedMotion: reduced }),
      )
      expect(harness.configure).toHaveBeenLastCalledWith(
        "low",
        reduced,
        window.devicePixelRatio,
      )
      expect(api.snapshot().position).toEqual(unchanged.position)
      expect(api.snapshot().simulationTime).toBe(unchanged.simulationTime)
      expect(api.snapshot().quality).toBe("low")
      api.step(1)
      expect(harness.travelerUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ locomotion: "idle" }),
        reduced ? 0 : 1 / 60,
      )
    }
    // Preferences still publish while paused; neither leaving reduce nor
    // resuming the world restarts the visitor-controlled score.
    runtime.pause()
    listener({ matches: true })
    listener({ matches: false })
    expect(api.snapshot().running).toBe(false)
    runtime.resume()
    api.step(30)
    expect(api.snapshot().sky.tick).toBe(before.sky.tick)
    runtime.skyCommand!("continue")
    api.step(1)
    expect(api.snapshot().sky.tick).toBe(before.sky.tick + 1)
  } finally {
    runtime.dispose()
  }
  expect(harness.removeMedia).toHaveBeenCalledWith("change", listener)
  const stopped = api.snapshot()
  harness.configure.mockClear()
  harness.draw.mockClear()
  onSkyStatus.mockClear()
  listener({ matches: true })
  expect(api.snapshot()).toEqual(stopped)
  expect(harness.configure).not.toHaveBeenCalled()
  expect(harness.draw).not.toHaveBeenCalled()
  expect(onSkyStatus).not.toHaveBeenCalled()

  const replacement = createThreeRuntime(canvas, {} as WebGL2RenderingContext)
  try {
    await replacement.ready
    const next = window.__CHARDIN_TEST__!
    harness.media!({ matches: false })
    const fresh = next.snapshot()
    listener({ matches: true })
    expect(next.snapshot()).toEqual(fresh)
    expect(canvas.dataset.reducedMotion).toBe("false")
  } finally {
    replacement.dispose()
  }
})

it("owns neutral sky, copied bounded ticks, status changes and unavailable landmark recovery data", async () => {
  const onSkyStatus = vi.fn()
  const runtime = createThreeRuntime(
    document.createElement("canvas"),
    {} as WebGL2RenderingContext,
    { onSkyStatus },
  )
  await runtime.ready
  const api = window.__CHARDIN_TEST__!
  expect(api.snapshot().sky.tick).toBe(0)
  expect(api.snapshot().landmarkAvailable).toBe(true)
  api.setSkyTick(4500)
  expect(api.snapshot().sky.tick).toBe(4500)
  expect(api.snapshot().sky.playback).toBe("paused")
  for (const tick of [-1, NaN, 1.5, 10801])
    expect(() => api.setSkyTick(tick)).toThrow()
  expect(api.snapshot().sky.tick).toBe(4500)
  const copy = api.snapshot()
  copy.localFeet[0] = 999
  copy.supportUp[0] = 999
  expect(api.snapshot().localFeet[0]).not.toBe(999)
  runtime.start()
  const calls = onSkyStatus.mock.calls.length
  api.step(60)
  expect(onSkyStatus).toHaveBeenCalledTimes(calls)
  runtime.pause()
  runtime.skyCommand!("return-to-clearing")
  expect(api.snapshot().sky.tick).toBe(0)
  expect(api.snapshot().running).toBe(false)
  runtime.dispose()
  window.history.replaceState({}, "", "/?e2e=1&landmarkFailure=1")
  const degraded = createThreeRuntime(
    document.createElement("canvas"),
    {} as WebGL2RenderingContext,
    { onSkyStatus },
  )
  await degraded.ready
  expect(window.__CHARDIN_TEST__!.snapshot().landmarkAvailable).toBe(false)
  degraded.start()
  window.__CHARDIN_TEST__!.step(60, { move: { x: 0, y: 1 } })
  expect(window.__CHARDIN_TEST__!.snapshot().distance).toBeGreaterThan(1)
  degraded.dispose()
})

import { walkToSkyspacePoint } from "../../e2e/helpers/skyspace-route"
it("traverses the real runtime route, plays deterministically, pauses on exit and freezes movement in aperture view", async () => {
  const status = vi.fn()
  const runtime = createThreeRuntime(
    document.createElement("canvas"),
    {} as WebGL2RenderingContext,
    { onSkyStatus: status },
  )
  await runtime.ready
  runtime.start()
  const api = window.__CHARDIN_TEST__!
  for (const point of [0, 1, 2, 3, 4]) walkToSkyspacePoint({ point })
  expect(status.mock.lastCall![0]).toMatchObject({
    inside: true,
    viewingZone: true,
  })
  runtime.skyCommand!("start")
  api.step(60)
  expect(api.snapshot().sky.tick).toBe(60)
  const standing = api.snapshot().position
  runtime.skyCommand!("view")
  api.step(30, { move: { x: 1, y: 1 }, jumpPressed: true })
  expect(api.snapshot().position).toEqual(standing)
  expect(api.snapshot().cameraMode).toBe("view")
  api.step(1, { actionPressed: true })
  expect(api.snapshot().cameraMode).not.toBe("view")
  runtime.pause()
  const paused = api.snapshot()
  api.step(60)
  expect(api.snapshot()).toEqual(paused)
  runtime.resume()
  for (const point of [3, 2, 1, 0])
    walkToSkyspacePoint({ point, backward: true })
  const left = api.snapshot().sky.tick
  api.step(60)
  expect(api.snapshot().sky.tick).toBe(left)
  expect(api.snapshot().sky.playback).toBe("paused")
  for (const point of [1, 2, 3, 4]) walkToSkyspacePoint({ point })
  expect(api.snapshot().sky.tick).toBe(left)
  runtime.skyCommand!("continue")
  api.step(1)
  expect(api.snapshot().sky.tick).toBe(left + 1)
  harness.reduced = true
  harness.media!({ matches: true })
  api.step(60)
  expect(api.snapshot().sky.tick).toBe(left + 1)
  harness.reduced = false
  harness.media!({ matches: false })
  api.step(60)
  expect(api.snapshot().sky.tick).toBe(left + 1)
  runtime.skyCommand!("next-still")
  expect(api.snapshot().sky.tick).toBeGreaterThan(left)
  runtime.skyCommand!("still")
  runtime.skyCommand!("freeze")
  runtime.skyCommand!("leave-view")
  runtime.dispose()
})
