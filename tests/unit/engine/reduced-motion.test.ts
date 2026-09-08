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
  resize: (() => {}) as () => void,
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
      constructor(callback: () => void) {
        harness.resize = callback
      }
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
      color: object instanceof THREE.Light ? object.color.toArray() : undefined,
      geometry:
        object instanceof THREE.Mesh
          ? Object.fromEntries(
              Object.entries(
                (object.geometry as THREE.BufferGeometry).attributes,
              ).map(([name, attribute]) => [name, Array.from(attribute.array)]),
            )
          : undefined,
      material:
        object instanceof THREE.Mesh
          ? (Array.isArray(object.material)
              ? object.material
              : [object.material]
            ).map((material) => ({
              opacity: material.opacity,
              color: material.color?.toArray(),
            }))
          : undefined,
    })
  })
  // Exact serialized comparison includes every numeric component, without
  // repeatedly walking tens of thousands of vertices in the assertion library.
  return JSON.stringify({
    objects,
    camera: harness.camera!.matrixWorld.toArray(),
    projection: harness.camera!.projectionMatrix.toArray(),
    background: (harness.scene!.background as THREE.Color).toArray(),
    fog: (harness.scene!.fog as THREE.Fog).color.toArray(),
  })
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

it("presents intermediate ordinary frames without advancing motor or gait, and freezes every meadow tier", async () => {
  window.history.replaceState({}, "", "/")
  const canvas = document.createElement("canvas")
  const runtime = createThreeRuntime(canvas, {} as WebGL2RenderingContext)
  try {
    await runtime.ready
    runtime.start()
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }))
    const frame = (milliseconds: number) => {
      harness.now = milliseconds
      harness.frame!(milliseconds)
    }
    frame(17)
    const api = window.__CHARDIN_TEST__!
    const first = api.snapshot()
    frame(25)
    const between = api.snapshot()
    expect(between.position).toEqual(first.position)
    expect(between.animation).toEqual(first.animation)
    expect(between.simulationTime).toBe(first.simulationTime)
    expect(between.presentation.alpha).toBeGreaterThan(first.presentation.alpha)
    expect(between.presentation.position).not.toEqual(
      first.presentation.position,
    )
    for (let i = 2; i < 30; i++) frame(i * 17)
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }))
    harness.reduced = true
    harness.motionChanged({ matches: true })
    const meshes = () =>
      harness.scene!.getObjectByName("Meadow medium") as THREE.InstancedMesh
    const frozen = Array.from(meshes().geometry.getAttribute("position").array)
    for (const tier of ["high", "low", "balanced"] as const) {
      runtime.setQuality!(tier)
      expect(
        Array.from(meshes().geometry.getAttribute("position").array),
      ).toEqual(frozen)
      frame(harness.now + 17)
      expect(
        Array.from(meshes().geometry.getAttribute("position").array),
      ).toEqual(frozen)
    }
  } finally {
    runtime.dispose()
  }
})

it.each([false, true])(
  "freezes the entire presented world across paused redraws (reduced %s)",
  async (reduced) => {
    harness.reduced = reduced
    window.history.replaceState({}, "", "/")
    const canvas = document.createElement("canvas")
    Object.defineProperties(canvas, {
      clientWidth: { value: 393 },
      clientHeight: { value: 727 },
    })
    const touchRoot = document.createElement("div")
    touchRoot.innerHTML = '<button data-touch-input="pause">Pause</button>'
    const onPauseRequested = vi.fn()
    const runtime = createThreeRuntime(canvas, {} as WebGL2RenderingContext, {
      touchRoot,
      onPauseRequested,
    })
    const tapPause = () => {
      touchRoot.firstElementChild!.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
      )
      touchRoot.firstElementChild!.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true }),
      )
    }
    const frame = (milliseconds: number) => {
      harness.now = milliseconds
      harness.frame!(milliseconds)
    }
    try {
      await runtime.ready
      runtime.start()
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }))
      frame(517)
      frame(525)
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }))
      const api = window.__CHARDIN_TEST__!
      const before = api.snapshot()
      const frozen = renderedState()
      tapPause()
      frame(550)
      expect(onPauseRequested).toHaveBeenCalledOnce()
      expect(api.snapshot().running).toBe(false)
      expect(renderedState()).toEqual(frozen)
      expect(before.presentation.alpha).toBeGreaterThan(0)
      expect(before.presentation.alpha).toBeLessThan(1)
      tapPause()
      frame(950) // A repeated tap/canceled callback cannot advance anything.
      runtime.pause()
      harness.resize() // A layout notification must not select a new pose/phase.
      expect(renderedState()).toEqual(frozen)
      expect(api.snapshot().animation).toEqual(before.animation)
      expect(api.snapshot().simulationTime).toBe(before.simulationTime)
      runtime.setQuality!(api.snapshot().quality)
      expect(renderedState()).toEqual(frozen)
      harness.motionChanged({ matches: reduced })
      expect(renderedState()).toEqual(frozen)
      runtime.resume()
      frame(975)
      expect(renderedState()).not.toEqual(frozen)
    } finally {
      runtime.dispose()
    }
  },
)

it.each([false, true])(
  "retains each species' frozen phase across paused quality and motion changes (initial reduced %s)",
  async (reduced) => {
    harness.reduced = reduced
    const runtime = createThreeRuntime(
      document.createElement("canvas"),
      {} as WebGL2RenderingContext,
    )
    const wind = () =>
      ["low", "medium", "accent"].map((kind) => {
        const mesh = harness.scene!.getObjectByName(
          `Meadow ${kind}`,
        ) as THREE.Mesh
        return Array.from(mesh.geometry.getAttribute("position").array)
      })
    try {
      await runtime.ready
      runtime.start()
      const api = window.__CHARDIN_TEST__!
      api.step(35, { move: { x: 0, y: 1 }, run: true })
      api.present(0.4)
      runtime.pause()
      const frozen = wind()
      const before = api.snapshot()
      for (const quality of ["high", "low", "balanced", "high"] as const) {
        runtime.setQuality!(quality)
        expect(wind()).toEqual(frozen)
        expect(api.snapshot().animation).toEqual(before.animation)
        expect(api.snapshot().presentation.alpha).toBe(
          before.presentation.alpha,
        )
        expect(api.snapshot().simulationTime).toBe(before.simulationTime)
      }
      if (reduced) return // Initial reduced motion keeps authored rest geometry.
      harness.reduced = true
      harness.motionChanged({ matches: true })
      runtime.resume()
      api.step(120)
      expect(wind()).toEqual(frozen)
      harness.reduced = false
      harness.motionChanged({ matches: false })
      expect(wind()).toEqual(frozen) // Resuming wind cannot jump to motor time.
      api.step(1)
      expect(wind()).not.toEqual(frozen)
    } finally {
      runtime.dispose()
    }
  },
)

it("freezes a playing non-neutral score, camera transition, feet and wind on every paused presentation", async () => {
  const { walkToSkyspacePoint } =
    await import("../../e2e/helpers/skyspace-route")
  const runtime = createThreeRuntime(
    document.createElement("canvas"),
    {} as WebGL2RenderingContext,
  )
  try {
    await runtime.ready
    runtime.start()
    for (const point of [0, 1, 2, 3, 4]) walkToSkyspacePoint({ point })
    const api = window.__CHARDIN_TEST__!
    api.setSkyTick(4500)
    runtime.skyCommand!("continue")
    runtime.skyCommand!("view")
    api.step(3)
    api.present(0.4)
    runtime.pause()
    const before = api.snapshot()
    const frozen = renderedState()
    expect(before.sky.tick).toBe(4503)
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      api.step(24, { move: { x: 1, y: 1 } })
      api.present(alpha)
      harness.resize()
      runtime.setQuality!(before.quality)
      expect(renderedState()).toEqual(frozen)
      expect(api.snapshot().sky).toEqual(before.sky)
      expect(api.snapshot().presentation).toEqual(before.presentation)
    }
    runtime.resume()
    api.step(1)
    expect(api.snapshot().sky.tick).toBe(4504)
  } finally {
    runtime.dispose()
  }
})
