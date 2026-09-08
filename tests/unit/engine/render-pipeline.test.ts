import * as THREE from "three"
import { expect, it, vi } from "vitest"
const owned = vi.hoisted(() => ({
  composers: [] as Array<{
    dispose: ReturnType<typeof vi.fn>
    setSize: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    initialRatio: unknown
    initialSize: unknown
    passes: unknown[]
  }>,
}))
vi.mock("postprocessing", async (original) => {
  const actual = await original<typeof import("postprocessing")>()
  return {
    ...actual,
    EffectComposer: class {
      passes: unknown[] = []
      dispose = vi.fn()
      setSize = vi.fn()
      render = vi.fn()
      initialRatio: unknown
      initialSize: unknown
      constructor(renderer: {
        setPixelRatio: ReturnType<typeof vi.fn>
        setSize: ReturnType<typeof vi.fn>
      }) {
        this.initialRatio = renderer.setPixelRatio.mock.lastCall?.[0]
        this.initialSize = renderer.setSize.mock.lastCall
        owned.composers.push(this)
      }
      addPass(pass: unknown) {
        this.passes.push(pass)
      }
    },
    SMAAEffect: class extends actual.Effect {
      constructor() {
        super(
          "SMAATest",
          "void mainImage(const in vec4 c, const in vec2 u, out vec4 o) { o = c; }",
        )
      }
      weightsMaterial = {
        searchTexture: new THREE.Texture(),
        areaTexture: new THREE.Texture(),
      }
    },
  }
})
import { createRenderPipeline } from "@/engine/render/render-pipeline"
it("resizes all targets through the composer, changes costs without reconstruction, and disposes once", async () => {
  const renderer = {
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    shadowMap: {},
    capabilities: {},
    getContext: () => ({ getExtension: () => null }),
  } as unknown as THREE.WebGLRenderer
  const sun = new THREE.DirectionalLight()
  const pipeline = createRenderPipeline(
    renderer,
    new THREE.Scene(),
    new THREE.PerspectiveCamera(),
    sun,
  )
  await pipeline.ready
  pipeline.configure("high", false, 4)
  pipeline.resize(800, 600)
  const composer = owned.composers.at(-1)!
  expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(2)
  expect(composer.setSize).toHaveBeenLastCalledWith(800, 600, false)
  expect(sun.shadow.mapSize.x).toBe(1024)
  const passCount = composer.passes.length
  pipeline.configure("low", true, 4)
  expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(0.7)
  expect(sun.shadow.mapSize.x).toBe(256)
  expect(composer.passes).toHaveLength(passCount)
  expect(renderer.toneMapping).toBe(THREE.NoToneMapping)
  pipeline.dispose()
  pipeline.dispose()
  pipeline.render(0)
  expect(composer.dispose).toHaveBeenCalledOnce()
  expect(composer.render).not.toHaveBeenCalled()
})

it("bounds renderer size before allocating the composer and starts with Low effects", async () => {
  const renderer = {
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    shadowMap: {},
    getContext: () => ({ getExtension: () => null }),
  } as unknown as THREE.WebGLRenderer
  const sun = new THREE.DirectionalLight()
  const pipeline = createRenderPipeline(
    renderer,
    new THREE.Scene(),
    new THREE.PerspectiveCamera(),
    sun,
    {
      quality: "low",
      deviceDpr: 4,
      reducedMotion: false,
      width: 393,
      height: 851,
    },
  )
  await pipeline.ready
  const composer = owned.composers.at(-1)!
  expect(composer.initialRatio).toBe(0.7)
  expect(composer.initialSize).toEqual([393, 851, false])
  expect(sun.shadow.mapSize.x).toBe(256)
  expect(composer.passes[3]).toHaveProperty("enabled", false)
  expect(composer.passes[5]).toHaveProperty("enabled", false)
  expect(composer.passes[4]).toHaveProperty("renderToScreen", true)
  pipeline.dispose()
})
