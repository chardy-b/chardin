import { readFileSync } from "node:fs"
import * as THREE from "three"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { Experience } from "@/engine/contracts"
import { createExperience } from "@/engine/create-experience"
import { walkToSkyspacePoint } from "../../e2e/helpers/skyspace-route"

const harness = vi.hoisted(() => ({
  fallback: false,
  scene: null as THREE.Scene | null,
  camera: null as THREE.PerspectiveCamera | null,
  renderedTraveler: [] as THREE.Object3D[],
  resize: null as (() => void) | null,
  motion: null as
    ((event: Pick<MediaQueryListEvent, "matches">) => void) | null,
  reduced: false,
}))
vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    dispose() {}
    info = { memory: { geometries: 0, textures: 0 } }
  },
}))
// Keep the actual GLB parser, Traveler owner, animation mixer, motor, collider,
// rig and runtime. Only the transport and GPU boundary are replaced.
vi.mock("@/engine/assets/character-loader", async (original) => {
  const actual =
    await original<typeof import("@/engine/assets/character-loader")>()
  return {
    ...actual,
    loadCharacter: (manifest: Parameters<typeof actual.loadCharacter>[0]) => {
      if (harness.fallback)
        return Promise.reject(new Error("local fallback fixture"))
      const bytes = readFileSync("public/models/traveler.glb")
      return actual.loadCharacter(manifest, {
        fetch: async () =>
          ({
            ok: true,
            arrayBuffer: async () => new Uint8Array(bytes).buffer,
          }) as Response,
      })
    },
  }
})
vi.mock("@/engine/render/render-pipeline", () => ({
  createRenderPipeline: (
    _renderer: unknown,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) => {
    harness.scene = scene
    harness.camera = camera
    return {
      ready: Promise.resolve(),
      applyLightFrame() {},
      configure() {},
      resize() {},
      dispose() {},
      render() {
        scene.updateMatrixWorld(true)
        camera.updateMatrixWorld(true)
        harness.renderedTraveler = []
        scene.getObjectByName("TravelerView")!.traverseVisible((object) => {
          if (object instanceof THREE.Mesh)
            harness.renderedTraveler.push(object)
        })
      },
    }
  },
}))

let experience: Experience | undefined
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_E2E_HOOKS", "true")
  window.history.replaceState({}, "", "/?e2e=1")
  harness.reduced = false
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return harness.reduced
    },
    addEventListener(
      _event: string,
      callback: NonNullable<typeof harness.motion>,
    ) {
      harness.motion = callback
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
  vi.stubGlobal("navigator", { getGamepads: () => [], hardwareConcurrency: 8 })
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  experience?.dispose()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it.each([
  [1280, 720, false],
  [768, 1024, false],
  [393, 851, false],
  [1280, 720, true],
  [768, 1024, true],
  [393, 851, true],
] as const)(
  "frames architecture and owns Traveler visibility at %ix%i (fallback %s)",
  async (width, height, fallback) => {
    harness.fallback = fallback
    const canvas = document.createElement("canvas")
    Object.defineProperties(canvas, {
      clientWidth: { value: width, configurable: true },
      clientHeight: { value: height, configurable: true },
    })
    let ready!: () => void
    const loaded = new Promise<void>((resolve) => {
      ready = resolve
    })
    experience = createExperience({
      canvas,
      getWebGL2Context: () => ({}) as WebGL2RenderingContext,
      onState(state) {
        if (state.status === "ready" || state.status === "recovered") ready()
      },
    })
    await loaded
    expect(canvas.dataset.travelerModel).toBe(fallback ? "fallback" : "loaded")
    experience.start()
    const api = window.__CHARDIN_TEST__!
    const owner = harness.scene!.getObjectByName("TravelerView")!
    expect(owner.children).toHaveLength(1)
    expect(owner.children[0].name).toBe(
      fallback ? "TravelerFallback" : "Traveler",
    )
    const representation = owner.children[0]
    const resources = representation.children.slice()
    const renderMeshes = () => {
      const meshes: THREE.Object3D[] = []
      harness.scene!.traverseVisible((object) => {
        if (object instanceof THREE.Mesh) meshes.push(object)
      })
      return meshes
    }
    const centerHits = () => {
      const ray = new THREE.Raycaster()
      ray.setFromCamera(new THREE.Vector2(), harness.camera!)
      return ray.intersectObjects(renderMeshes(), false)
    }
    for (const point of [0, 1, 2, 3, 4]) {
      walkToSkyspacePoint({ point, facePoint: point === 0 ? 1 : undefined })
      const state = api.snapshot()
      expect(state.cameraMode).not.toBe("blocked")
      if (point === 0) {
        const forward = new THREE.Vector3().fromArray(state.forward)
        const towardDoor = new THREE.Vector3()
          .fromArray(state.route[1])
          .sub(new THREE.Vector3().fromArray(state.position))
        expect(forward.dot(towardDoor.normalize())).toBeGreaterThan(0.95)
        const cameraOffset = new THREE.Vector3()
          .fromArray(state.cameraPosition)
          .sub(new THREE.Vector3().fromArray(state.position))
        expect(cameraOffset.dot(forward)).toBeLessThan(-1)
        // The authored GLB faces -Z; its pack (+Z) stays behind its movement.
        expect(
          new THREE.Vector3(0, 0, -1)
            .applyQuaternion(owner.quaternion)
            .dot(forward),
        ).toBeGreaterThan(0.999)
        expect(harness.renderedTraveler.length).toBeGreaterThan(0)
        const door = new THREE.Vector3()
          .fromArray(state.route[3])
          .addScaledVector(new THREE.Vector3().fromArray(state.supportUp), 0.8)
          .project(harness.camera!)
        expect(Math.abs(door.x)).toBeLessThan(1)
        expect(Math.abs(door.y)).toBeLessThan(1)
      }
      if (point >= 3) {
        expect(state.travelerVisible).toBe(false)
        expect(owner.visible).toBe(false)
        expect(harness.renderedTraveler).toHaveLength(0)
        expect(centerHits().length).toBeGreaterThan(0)
        expect(centerHits()[0].object.parent?.name).toBe(
          "Original skyspace pavilion",
        )
      }
    }
    const standing = api.snapshot().position
    for (const quality of ["high", "low", "balanced"] as const) {
      experience.setQuality(quality)
      experience.skyCommand("view")
      expect(api.snapshot().cameraMode).toBe("view")
      expect(harness.camera!.fov).toBe(width / height < 0.85 ? 78 : 60)
      expect(centerHits()).toHaveLength(0) // Actual scene center ray sees authored sky.
      expect(harness.renderedTraveler).toHaveLength(0)
      harness.reduced = !harness.reduced
      harness.motion!({ matches: harness.reduced })
      Object.defineProperties(canvas, {
        clientWidth: { value: height, configurable: true },
        clientHeight: { value: width, configurable: true },
      })
      harness.resize!()
      expect(harness.camera!.fov).toBe(height / width < 0.85 ? 78 : 60)
      expect(harness.renderedTraveler).toHaveLength(0)
      expect(centerHits()).toHaveLength(0)
      Object.defineProperties(canvas, {
        clientWidth: { value: width, configurable: true },
        clientHeight: { value: height, configurable: true },
      })
      harness.resize!()
      api.step(1, { move: { x: 1, y: 1 }, jumpPressed: true })
      expect(api.snapshot().position).toEqual(standing)
      experience.skyCommand("leave-view")
      expect(owner.visible).toBe(false) // Interior walking stays unobstructed.
    }
    for (const point of [3, 2, 1, 0])
      walkToSkyspacePoint({ point, backward: true })
    expect(owner.visible).toBe(true)
    expect(harness.renderedTraveler.length).toBeGreaterThan(0)
    expect(owner.children[0]).toBe(representation)
    expect(representation.children).toEqual(resources)
    for (const point of [1, 2, 3, 4]) walkToSkyspacePoint({ point })
    experience.skyCommand("view")
    experience.pause()
    experience.skyCommand("return-to-clearing")
    expect(owner.visible).toBe(true)
    expect(api.snapshot().running).toBe(false)
    experience.resume()
    for (const point of [0, 1, 2, 3, 4]) walkToSkyspacePoint({ point })
    experience.skyCommand("view")
    expect(owner.visible).toBe(false)
    const recovered = new Promise<void>((resolve) => {
      ready = resolve
    })
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }))
    expect(owner.visible).toBe(true)
    expect(owner.parent).toBeNull()
    expect(owner.children).toHaveLength(0)
    canvas.dispatchEvent(new Event("webglcontextrestored"))
    await recovered
    const nextOwner = harness.scene!.getObjectByName("TravelerView")!
    expect(nextOwner).not.toBe(owner)
    expect(nextOwner.visible).toBe(true)
    expect(window.__CHARDIN_TEST__!.snapshot().running).toBe(false)
  },
)

it("provides repeatable Loop 2 frames and interpolation without changing motor, light, or animation ticks", async () => {
  const { prepareCharacterFrame, visualLoopMetadata } =
    await import("../../e2e/helpers/visual-loop")
  harness.fallback = false
  const canvas = document.createElement("canvas")
  Object.defineProperties(canvas, {
    clientWidth: { value: 1280 },
    clientHeight: { value: 720 },
  })
  let ready!: () => void
  const loaded = new Promise<void>((resolve) => {
    ready = resolve
  })
  experience = createExperience({
    canvas,
    getWebGL2Context: () => ({}) as WebGL2RenderingContext,
    onState(state) {
      if (state.status === "ready") ready()
    },
  })
  await loaded
  experience.start()
  const api = window.__CHARDIN_TEST__!
  const character = prepareCharacterFrame()
  expect(character.quality).toBe("balanced")
  expect(character.grounded).toBe(true)
  expect(character.movement.signedSpeed).toBeCloseTo(3.3, 3)
  const owner = harness.scene!.getObjectByName("TravelerView")!
  const left = new THREE.Vector3(),
    right = new THREE.Vector3()
  owner.getObjectByName("LeftAnkle")!.getWorldPosition(left)
  owner.getObjectByName("RightAnkle")!.getWorldPosition(right)
  expect(left.distanceTo(right)).toBeGreaterThan(0.3)
  const fixed = api.snapshot()
  const invariant = () => {
    const state = api.snapshot()
    return [
      state.position,
      state.forward,
      state.supportId,
      state.supportUp,
      state.simulationTime,
      state.sky,
      state.animation,
    ]
  }
  const original = invariant()
  let lastPosition: THREE.Vector3 | undefined
  for (const alpha of [0, 0.25, 0.5, 0.75, 1, 0.5, 1]) {
    api.present(alpha)
    expect(invariant()).toEqual(original)
    const position = owner.position.clone()
    if (lastPosition)
      expect(position.distanceTo(lastPosition)).toBeLessThan(0.06)
    lastPosition = position
  }
  for (const invalid of [-1, 2, Number.NaN, Infinity]) api.present(invalid)
  expect(invariant()).toEqual(original)
  const metadata = visualLoopMetadata(fixed, {
    commit: "a".repeat(40),
    dirty: true,
    diffSha256: "b".repeat(64),
  })
  expect(metadata.animation.phase).toBeGreaterThan(0.08)
  metadata.player.position[0] = 999
  expect(api.snapshot().position).toEqual(fixed.position)
  expect(() =>
    visualLoopMetadata(fixed, {
      commit: "unknown",
      dirty: true,
      diffSha256: "",
    }),
  ).toThrow()
  expect(() => prepareCharacterFrame()).toThrow("Fresh runtime")
  experience.pause()
  experience.skyCommand("return-to-clearing")
  experience.resume()
  walkToSkyspacePoint({ point: 0, facePoint: 1 })
  api.present(1)
  const state = api.snapshot()
  const structure = harness.scene!.getObjectByName(
    "Original skyspace pavilion",
  )!
  const project = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z)
      .applyMatrix4(structure.matrixWorld)
      .project(harness.camera!)
  const door = project(0, 0.9, 1.5)
  const head = owner
    .getObjectByName("Head")!
    .getWorldPosition(new THREE.Vector3())
    .project(harness.camera!)
  expect(Math.abs(door.x - head.x)).toBeGreaterThan(0.1)
  for (const point of [
    [-0.73, 0.22, 1.65],
    [0.73, 0.22, 1.65],
    [-0.73, -1.18, 3.25],
    [0.73, -1.18, 3.25],
  ]) {
    const p = project(...(point as [number, number, number]))
    expect(Math.abs(p.x)).toBeLessThan(0.95)
    expect(Math.abs(p.y)).toBeLessThan(0.95)
  }
  expect(state.cameraMode).toBe("walking")
  const heading = new THREE.Vector3().fromArray(state.forward)
  const up = new THREE.Vector3().fromArray(state.supportUp)
  const side = new THREE.Vector3().crossVectors(heading, up).normalize()
  const offset = new THREE.Vector3()
    .fromArray(state.cameraPosition)
    .sub(new THREE.Vector3().fromArray(state.position))
  // Shoulder and composition yaw reinforce, rather than cancel, the view angle.
  expect(Math.atan2(offset.dot(side), -offset.dot(heading))).toBeGreaterThan(
    0.5,
  )
})
