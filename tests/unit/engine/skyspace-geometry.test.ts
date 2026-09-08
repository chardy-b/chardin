import * as THREE from "three"
import { expect, it } from "vitest"
import {
  landmarkDefinition,
  validateLandmarkDefinition,
} from "@/engine/assets/manifest"
import {
  createSkyspaceStructure,
  rampHeight,
} from "@/engine/world/skyspace-landmark"
import { createLandmarkAnchor } from "@/engine/world/landmark-anchor"

it("validates the fixed original definition before allocation", () => {
  expect(validateLandmarkDefinition(landmarkDefinition)).toEqual(
    landmarkDefinition,
  )
  for (const patch of [
    { heading: NaN },
    { radius: 500 },
    {
      aperture: [
        [0, 0],
        [1, 0],
        [0, -1],
      ],
    },
    { assetUrl: "//evil" },
    { scoreVersion: 99 },
  ])
    expect(() =>
      validateLandmarkDefinition({ ...landmarkDefinition, ...patch }),
    ).toThrow()
})
it("builds a proper translated frame and bounded shared ramp triangles", () => {
  const center = new THREE.Vector3(2, -3, 4)
  const structure = createSkyspaceStructure(createLandmarkAnchor(center))
  expect(structure.matrix.determinant()).toBeCloseTo(1, 12)
  const p = new THREE.Vector3(0.2, 0.12, 0.5)
  expect(structure.toLocal(structure.toWorld(p)).distanceTo(p)).toBeLessThan(
    1e-6,
  )
  expect(structure.triangles.length).toBeLessThanOrEqual(768)
  const ramp = structure.triangles.filter((t) => t.support === "ramp")
  expect(ramp).toHaveLength(416)
  for (const t of ramp) {
    expect(
      Math.max(t.a.distanceTo(t.b), t.b.distanceTo(t.c), t.c.distanceTo(t.a)),
    ).toBeLessThanOrEqual(0.2)
    const radial = t.a
      .clone()
      .add(t.b)
      .add(t.c)
      .divideScalar(3)
      .add(new THREE.Vector3(0, 5, 0))
      .normalize()
    expect(t.normal.angleTo(radial)).toBeLessThan((55 * Math.PI) / 180)
  }
  expect(rampHeight(0, 1.65)).toBe(0.12)
  expect(rampHeight(0, 3.25)).toBeCloseTo(-1.16094, 5)
})
it("leaves real sky rays clear at every viewing-zone corner", () => {
  const structure = createSkyspaceStructure()
  const ray = new THREE.Ray()
  for (const x of [-0.25, 0.25])
    for (const z of [0.3, 0.7]) {
      const eye = new THREE.Vector3(x, 1.37, z)
      for (const target of [
        new THREE.Vector3(0, 2.35, -0.15),
        new THREE.Vector3(0.1, 2.35, -0.2),
      ]) {
        ray.set(eye, target.clone().sub(eye).normalize())
        expect(
          structure.triangles.some((t) =>
            ray.intersectTriangle(t.a, t.b, t.c, false, new THREE.Vector3()),
          ),
        ).toBe(false)
      }
    }
})

import { vi } from "vitest"
import { createSkyspaceLandmark } from "@/engine/world/skyspace-landmark"
import { createContentProfiles } from "@/engine/world/content-profiles"
import { createTravelerView } from "@/engine/player/traveler-view"
it("keeps all quality variants within allocation guards and disposes only owned resources", () => {
  const texture = new THREE.Texture(),
    borrowed = vi.spyOn(texture, "dispose")
  const landmark = createSkyspaceLandmark(texture, (_tier, direction) => ({
    position: direction.clone().multiplyScalar(5),
  }))
  const mesh = landmark.object.children[0] as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.Material[]
  >
  const geometry = mesh.geometry,
    attribute = geometry.getAttribute("position")
  const dispose = vi.spyOn(geometry, "dispose"),
    materials = mesh.material.map((m) => vi.spyOn(m, "dispose"))
  expect(geometry.index).not.toBeNull()
  expect(landmark.triangleCount).toBeLessThanOrEqual(2000)
  expect(geometry.groups).toHaveLength(4)
  expect(landmark.structure.triangles.length).toBeLessThanOrEqual(768)
  for (const quality of ["high", "low", "balanced"] as const) {
    landmark.setQuality(quality)
    expect(mesh.geometry).toBe(geometry)
    expect(geometry.getAttribute("position")).toBe(attribute)
  }
  landmark.applyWall([0.3, 0.4, 0.5])
  expect((mesh.material[1] as THREE.MeshBasicMaterial).color.toArray()).toEqual(
    [0.3, 0.4, 0.5],
  )
  landmark.dispose()
  landmark.dispose()
  expect(dispose).toHaveBeenCalledOnce()
  materials.forEach((m) => expect(m).toHaveBeenCalledOnce())
  expect(borrowed).not.toHaveBeenCalled()
  texture.dispose()
})
it.each(["setIndex", "setAttribute", "computeBoundingSphere"] as const)(
  "rolls back successful geometry/material allocations when %s fails",
  (stage) => {
    const materials = vi.spyOn(THREE.Material.prototype, "dispose"),
      geometry = vi.spyOn(THREE.BufferGeometry.prototype, "dispose")
    vi.spyOn(THREE.BufferGeometry.prototype, stage).mockImplementationOnce(
      () => {
        throw new Error("injected")
      },
    )
    expect(() =>
      createSkyspaceLandmark(null, (_tier, direction) => ({
        position: direction.clone().multiplyScalar(5),
      })),
    ).toThrow("injected")
    expect(materials).toHaveBeenCalledTimes(4)
    expect(geometry).toHaveBeenCalledOnce()
  },
)
it("tests accepted aperture rays against every complete scene mesh on every terrain tier", async () => {
  const profiles = createContentProfiles()
  const landmark = createSkyspaceLandmark(
    profiles.get("low").planet.mesh.material.gradientMap,
    (q, d) => profiles.get(q).planet.surfaceAt(d),
  )
  const traveler = createTravelerView({ load: () => new Promise(() => {}) })
  const scene = new THREE.Scene(),
    raycaster = new THREE.Raycaster()
  scene.add(landmark.object, traveler.object)
  try {
    for (const quality of ["low", "balanced", "high"] as const) {
      const content = profiles.get(quality)
      scene.add(content.planet.mesh, content.grass.mesh)
      landmark.setQuality(quality)
      for (const x of [-0.25, 0.25])
        for (const z of [0.3, 0.7]) {
          traveler.object.position.copy(
            landmark.structure.toWorld(new THREE.Vector3(x, 0.12, z)),
          )
          traveler.object.quaternion.setFromRotationMatrix(
            landmark.structure.matrix,
          )
          scene.updateMatrixWorld(true)
          const eye = landmark.structure.toWorld(new THREE.Vector3(x, 1.37, z))
          for (let sx = -0.2; sx <= 0.2; sx += 0.1)
            for (let sz = -0.3; sz <= 0.1; sz += 0.1) {
              const target = landmark.structure.toWorld(
                new THREE.Vector3(sx, 2.35, sz),
              )
              raycaster.set(eye, target.sub(eye).normalize())
              expect(
                raycaster.intersectObjects(scene.children, true),
              ).toHaveLength(0)
            }
        }
      scene.remove(content.planet.mesh, content.grass.mesh)
    }
  } finally {
    traveler.dispose()
    landmark.dispose()
    profiles.dispose()
  }
  await traveler.ready
})

import { writeFileSync } from "node:fs"
it("records reproducible canonical geometry for local provenance when explicitly requested", () => {
  const structure = createSkyspaceStructure()
  const bounds = new THREE.Box3().setFromPoints(
    structure.triangles.flatMap((t) => [t.a, t.b, t.c]),
  )
  const canonical = {
    id: "skyspace-pavilion-v1",
    collisionTriangles: structure.triangles.length,
    decorationTriangles: structure.decoration.length,
    colorTriangles: structure.triangles.length + structure.decoration.length,
    colorMaterialGroups: 4,
    addedTextureBytes: 0,
    addedPostprocessingPasses: 0,
    addedAudioBytes: 0,
    localBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    frameDeterminant: structure.matrix.determinant(),
  }
  expect(canonical.collisionTriangles).toBeLessThanOrEqual(768)
  if (process.env.WIL125_CANONICAL_OUTPUT)
    writeFileSync(
      process.env.WIL125_CANONICAL_OUTPUT,
      JSON.stringify(canonical, null, 2) + "\n",
    )
})
