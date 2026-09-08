import { readFileSync } from "node:fs"
import * as THREE from "three"
import { expect, it, vi } from "vitest"
import { loadCharacter } from "@/engine/assets/character-loader"
import { travelerManifest } from "@/engine/assets/manifest"
import { createTravelerView } from "@/engine/player/traveler-view"
import { createInitialPlayerState } from "@/engine/player/player-motor"

async function generated() {
  const bytes = readFileSync("public/models/traveler.glb")
  return loadCharacter(travelerManifest, {
    fetch: async () =>
      ({
        ok: true,
        arrayBuffer: async () => new Uint8Array(bytes).buffer,
      }) as Response,
  })
}

it("proves the actual exported hierarchy, silhouette, clips and bounded baked data", async () => {
  const asset = await generated()
  for (const side of ["Left", "Right"]) {
    expect(asset.root.getObjectByName(`${side}Boot`)!.parent!.name).toBe(
      `${side}Ankle`,
    )
    expect(asset.root.getObjectByName(`${side}Ankle`)!.parent!.name).toBe(
      `${side}Knee`,
    )
    expect(asset.root.getObjectByName(`${side}Knee`)!.parent!.name).toBe(
      `${side}Leg`,
    )
    expect(asset.root.getObjectByName(`${side}Hand`)!.parent!.name).toBe(
      `${side}Elbow`,
    )
  }
  expect(asset.root.getObjectByName("Boots")).toBeUndefined()
  expect(asset.clips.walk!.duration).toBeCloseTo(0.8)
  expect(asset.clips.run!.duration).toBeCloseTo(0.52)
  expect(asset.clips.run!.duration).toBeLessThan(asset.clips.walk!.duration)
  expect(asset.root.userData.authoring.version).toBe(2)
  const bounds = new THREE.Box3().setFromObject(asset.root)
  expect(bounds.min.y).toBeCloseTo(0, 5)
  expect(bounds.max.y).toBeLessThan(1.3)
  expect(bounds.max.x - bounds.min.x).toBeLessThan(0.65)
  let triangles = 0
  asset.root.traverse((node) => {
    if (node instanceof THREE.Mesh)
      triangles +=
        (node.geometry.index?.count ??
          node.geometry.getAttribute("position").count) / 3
  })
  expect(triangles).toBeLessThan(2200)
  for (const clip of Object.values(asset.clips)) {
    expect(clip.tracks.length).toBe(16)
    expect(
      clip.tracks.some((track) => track.name === "Traveler.position"),
    ).toBe(false)
    for (const track of clip.tracks)
      expect([...track.values].every(Number.isFinite)).toBe(true)
  }
  asset.dispose()
})

it.each([
  ["walk", 1.65, 0.5],
  ["run", 3.3, 0.34],
] as const)(
  "keeps exported %s contacts planted, separates feet and loops without a pose discontinuity",
  async (name, speed, stance) => {
    const asset = await generated()
    const mixer = new THREE.AnimationMixer(asset.root)
    const clip = asset.clips[name]!
    mixer.clipAction(clip).play()
    const left = asset.root.getObjectByName("LeftAnkle")!
    const right = asset.root.getObjectByName("RightAnkle")!
    const a = new THREE.Vector3(),
      b = new THREE.Vector3()
    let maxSlide = 0,
      maxHeightError = 0,
      maxSeparation = 0,
      airborne = 0
    let lastZ: number | undefined
    // Evaluate actual parsed quaternion interpolation between the baked keys.
    for (let i = 0; i < 240; i++) {
      const phase = i / 240
      mixer.setTime(phase * clip.duration)
      asset.root.updateMatrixWorld(true)
      left.getWorldPosition(a)
      right.getWorldPosition(b)
      maxSeparation = Math.max(maxSeparation, Math.abs(a.z - b.z))
      if (a.y > 0.095 && b.y > 0.095) airborne++
      if (phase < stance - 0.02) {
        const worldZ = a.z - phase * clip.duration * speed
        if (lastZ !== undefined)
          maxSlide = Math.max(maxSlide, Math.abs(worldZ - lastZ))
        lastZ = worldZ
        maxHeightError = Math.max(maxHeightError, Math.abs(a.y - 0.08))
      }
    }
    expect(maxSlide).toBeLessThan(0.001)
    expect(maxHeightError).toBeLessThan(0.001)
    expect(maxSeparation).toBeGreaterThan(0.5)
    expect(airborne > 0).toBe(name === "run")
    mixer.setTime(0)
    asset.root.updateMatrixWorld(true)
    left.getWorldPosition(a)
    mixer.setTime(clip.duration - 0.00001)
    asset.root.updateMatrixWorld(true)
    left.getWorldPosition(b)
    expect(a.distanceTo(b)).toBeLessThan(0.0001)
    asset.dispose()
  },
)

it("rates by actual speed, preserves gait phase and reuses pose/material storage through presentation", async () => {
  const asset = await generated()
  const originalMaterials = new Set<THREE.Material>()
  asset.root.traverse((node) => {
    if (node instanceof THREE.Mesh) originalMaterials.add(node.material)
  })
  const releases = [...originalMaterials].map((material) =>
    vi.spyOn(material, "dispose"),
  )
  const view = createTravelerView({ load: async () => asset })
  await view.ready
  const state = createInitialPlayerState({
    planetCenter: new THREE.Vector3(),
    groundRadius: 5.03,
    walkSpeed: 1.65,
    runSpeed: 3.3,
    turnSpeed: 1.9,
    jumpSpeed: 4.2,
    gravity: 9.8,
  })
  state.locomotion = "walk"
  view.update(state, 0.2, 0.825)
  expect(view.animationState().phase).toBeCloseTo(0.125)
  state.locomotion = "run"
  view.update(state, 0.016, 0)
  expect(view.animationState().phase).toBeCloseTo(0.125)
  const before = view.animationState()
  const nodes: THREE.Object3D[] = []
  const replacements = new Set<THREE.Material>()
  asset.root.traverse((node) => {
    nodes.push(node)
    if (node instanceof THREE.Mesh) {
      expect(node.material).toBeInstanceOf(THREE.MeshToonMaterial)
      replacements.add(node.material)
    }
  })
  const ramps = new Set(
    [...replacements].map(
      (material) => (material as THREE.MeshToonMaterial).gradientMap,
    ),
  )
  expect(ramps.size).toBe(1)
  const rampRelease = vi.spyOn([...ramps][0]!, "dispose")
  const replacementReleases = [...replacements].map((material) =>
    vi.spyOn(material, "dispose"),
  )
  const initialTransforms = nodes.map((node) => [
    node.position,
    node.quaternion,
  ])
  for (let i = 0; i < 1000; i++) view.present((i % 101) / 100)
  expect(view.animationState()).toEqual(before)
  expect(nodes.map((node) => [node.position, node.quaternion])).toEqual(
    initialTransforms,
  )
  view.update(state, 0.016, -3.3)
  expect(view.animationState().timeScale).toBe(-1)
  view.update(state, 0.016, Number.NaN)
  expect(view.animationState().timeScale).toBe(0)
  view.present(Number.NaN)
  view.dispose()
  view.dispose()
  view.present(0.5)
  expect(rampRelease).toHaveBeenCalledOnce()
  for (const release of [...releases, ...replacementReleases])
    expect(release).toHaveBeenCalledOnce()
})
