import * as THREE from "three"
import { expect, it } from "vitest"
import { createGrass, createTuftGeometry } from "@/engine/world/grass"
import { createPlanet } from "@/engine/world/planet"
import { createContactShadow } from "@/engine/player/contact-shadow"
import { createPresentation } from "@/engine/player/presentation"

it("selects independent low, medium and accent geometry within the total instance budget", () => {
  const heights = ["low", "medium", "accent"].map((kind) => {
    const geometry = createTuftGeometry(kind as "low" | "medium" | "accent")
    geometry.computeBoundingBox()
    const height = geometry.boundingBox!.max.y
    expect(geometry.getAttribute("position").count / 3).toBeLessThanOrEqual(48)
    geometry.dispose()
    return height
  })
  expect(heights[1]).toBeGreaterThan(heights[0] * 1.6)
  expect(heights[2]).toBeGreaterThan(heights[1] * 1.3)
  const grass = createGrass()
  expect(grass.mesh.children).toHaveLength(3)
  const batches = grass.mesh.children as THREE.InstancedMesh[]
  expect(batches.reduce((sum, mesh) => sum + mesh.count, 0)).toBe(960)
  expect(batches[0].count).toBeGreaterThan(batches[1].count)
  expect(batches[1].count).toBeGreaterThan(batches[2].count * 2)
  grass.dispose()
})

it("uses continuous diffuse terrain lighting so a toon threshold cannot carve foreground wedges", () => {
  const planet = createPlanet()
  expect(planet.mesh.material.gradientMap!.minFilter).toBe(THREE.LinearFilter)
  expect(planet.mesh.material.gradientMap!.magFilter).toBe(THREE.LinearFilter)
  planet.dispose()
})

it("fades each sole shadow independently as a foot lifts instead of popping at the cutoff", () => {
  const shade = createContactShadow()
  const p = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0)
  shade.place(0, p, up, 0)
  shade.place(1, p, up, 0.29)
  const [a, b] = shade.object.children as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >[]
  expect(a.material.opacity).toBe(1)
  expect(b.material.opacity).toBeLessThan(0.02)
  expect(a.material).not.toBe(b.material)
  shade.dispose()
})

it("interpolates camera samples across mode boundaries", () => {
  const previous = {
    position: new THREE.Vector3(0, 1, 4),
    target: new THREE.Vector3(0, 1, 0),
    up: new THREE.Vector3(0, 1, 0),
    forward: new THREE.Vector3(0, 0, -1),
    yaw: 0,
    pitch: 0,
    mode: "walking" as const,
  }
  const current = {
    ...previous,
    position: new THREE.Vector3(0, 1, 0),
    mode: "view" as const,
  }
  const presentation = createPresentation()
  presentation.camera(previous, current, 0.25)
  expect(presentation.cameraPosition.z).toBeCloseTo(3)
})

it("eases fixed camera view transitions and finishes at the requested pose", async () => {
  const { easeCameraTransition } =
    await import("@/engine/camera/third-person-camera")
  const previous = {
    position: new THREE.Vector3(0, 1, 1),
    target: new THREE.Vector3(0, 1, 0),
    up: new THREE.Vector3(0, 1, 0),
    forward: new THREE.Vector3(0, 0, -1),
    yaw: 0,
    pitch: 0,
    mode: "walking" as const,
  }
  const desired = {
    ...previous,
    position: new THREE.Vector3(0, 1, 0),
    target: new THREE.Vector3(0, 2, -1),
    mode: "view" as const,
    hideTraveler: true,
  }
  let state = easeCameraTransition(previous, desired, 1 / 60)
  expect(state.position.z).toBeGreaterThan(0.8)
  for (let i = 0; i < 120; i++)
    state = easeCameraTransition(state, desired, 1 / 60)
  expect(state.position.distanceTo(desired.position)).toBeLessThan(0.001)
  expect(state.transitioning).toBeFalsy()
})

it("records measured drawing-buffer identity and rejects an unavailable context", async () => {
  const { visualLoopEnvironment } =
    await import("../../e2e/helpers/visual-loop")
  const { vi } = await import("vitest")
  const canvas = document.createElement("canvas")
  canvas.width = 1280
  document.body.append(canvas)
  const gl = {
    isContextLost: () => false,
    drawingBufferWidth: 1088,
    drawingBufferHeight: 612,
    getExtension: () => null,
    RENDERER: 1,
    VENDOR: 2,
    VERSION: 3,
    getParameter: (value: number) =>
      ["", "fixture GPU", "fixture vendor", "WebGL 2"][value],
  }
  vi.spyOn(canvas, "getContext").mockReturnValue(
    gl as unknown as WebGL2RenderingContext,
  )
  expect(visualLoopEnvironment()).toMatchObject({
    renderer: "fixture GPU",
    unmaskedRendererAvailable: false,
    drawingBuffer: { width: 1088, height: 612 },
    canvas: { width: 1280 },
  })
  gl.isContextLost = () => true
  expect(() => visualLoopEnvironment()).toThrow("live captured WebGL2")
  canvas.remove()
})
