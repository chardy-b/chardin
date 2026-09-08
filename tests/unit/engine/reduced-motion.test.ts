import { readFile } from "node:fs/promises"
import * as THREE from "three"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const harness = vi.hoisted(() => ({
  scene: null as THREE.Scene | null,
  camera: null as THREE.Camera | null,
  reduced: false,
  motionChanged: (() => {}) as (
    event: Pick<MediaQueryListEvent, "matches">,
  ) => void,
  frame: null as FrameRequestCallback | null,
  now: 0,
}))

// Keep the real motor, camera, content, GLB loader and AnimationMixer. Only the
// GPU boundary is replaced; these tests never launch a browser or fetch a URL.
vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    info = { memory: { geometries: 0, textures: 0 } }
    dispose() {}
  },
}))
vi.mock("@/engine/render/render-pipeline", () => ({
  createRenderPipeline: (
    _renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) => {
    harness.scene = scene
    harness.camera = camera
    return {
      ready: Promise.resolve(),
      applyLightFrame: vi.fn(),
      configure() {},
      resize() {},
      render() {
        scene.updateMatrixWorld(true)
        camera.updateMatrixWorld(true)
      },
      dispose() {},
    }
  },
}))

import { createThreeRuntime } from "@/engine/three-runtime"

beforeEach(async () => {
  harness.reduced = false
  harness.now = 0
  vi.spyOn(performance, "now").mockImplementation(() => harness.now)
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    harness.frame = callback
    return 1
  })
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
  vi.stubGlobal("navigator", { getGamepads: () => [], hardwareConcurrency: 4 })
  vi.stubEnv("NEXT_PUBLIC_E2E_HOOKS", "true")
  window.history.replaceState({}, "", "/?e2e=1")
  const bytes = await readFile("public/models/traveler.glb")
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes)),
  )
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return harness.reduced
    },
    addEventListener: (
      _event: string,
      callback: typeof harness.motionChanged,
    ) => {
      harness.motionChanged = callback
    },
    removeEventListener() {},
  }))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
})

it("freezes ambient light and the loaded idle animation in the production loop on a live preference change", async () => {
  window.history.replaceState({}, "", "/")
  const onFatal = vi.fn()
  const runtime = createThreeRuntime(
    document.createElement("canvas"),
    {} as WebGL2RenderingContext,
    { onFatal },
  )
  const step = () => {
    harness.now += 1000 / 60
    harness.frame!(harness.now)
    expect(onFatal).not.toHaveBeenCalled()
  }
  try {
    await runtime.ready
    runtime.start()
    const initial = renderedState()
    for (let i = 0; i < 30; i++) step()
    expect(renderedState()).not.toEqual(initial)
    const sun = harness.scene!.children.find(
      (object): object is THREE.DirectionalLight =>
        object instanceof THREE.DirectionalLight,
    )!
    expect(sun.intensity).toBe(2.4)
    harness.reduced = true
    harness.motionChanged({ matches: true })
    step()
    const first = renderedState()
    for (let i = 0; i < 120; i++) {
      step()
      expect(renderedState()).toEqual(first)
    }
    harness.reduced = false
    harness.motionChanged({ matches: false })
    step()
    expect(renderedState()).not.toEqual(first)
  } finally {
    runtime.dispose()
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function renderedState() {
  const objects: unknown[] = []
  harness.scene!.traverse((object) => {
    objects.push({
      name: object.name,
      matrix: object.matrixWorld.toArray(),
      visible: object.visible,
      intensity: object instanceof THREE.Light ? object.intensity : undefined,
    })
  })
  return { objects, camera: harness.camera!.matrixWorld.toArray() }
}

it("keeps the real loaded idle traveler, camera and lights identical across 120 reduced-motion steps", async () => {
  const canvas = document.createElement("canvas")
  Object.defineProperties(canvas, {
    clientWidth: { value: 393 },
    clientHeight: { value: 727 },
  })
  const runtime = createThreeRuntime(canvas, {} as WebGL2RenderingContext)
  try {
    await runtime.ready
    expect(canvas.dataset.travelerModel).toBe("loaded")
    runtime.start()
    harness.reduced = true
    harness.motionChanged({ matches: true })
    const api = window.__CHARDIN_TEST__!
    api.step(1)
    const first = renderedState()
    const before = api.snapshot()
    for (let i = 0; i < 120; i++) {
      api.step(1)
      expect(renderedState()).toEqual(first)
    }
    expect(api.snapshot().position).toEqual(before.position)
    expect(api.snapshot().distance).toBe(before.distance)
    expect(api.snapshot().simulationTime).toBeCloseTo(before.simulationTime + 2)
    api.step(60, { move: { x: 0, y: 1 } })
    expect(api.snapshot().distance - before.distance).toBeGreaterThan(1)
    expect(renderedState()).not.toEqual(first)
  } finally {
    runtime.dispose()
  }
})
