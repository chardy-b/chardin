import * as THREE from "three"
import { expect, it, vi } from "vitest"
import {
  createGrass,
  createTuftGeometry,
  meadowDensity,
} from "@/engine/world/grass"
import { createPlanet, PLANET_PROFILES } from "@/engine/world/planet"
import { createContactShadow } from "@/engine/player/contact-shadow"

it("gives shared terrain edges continuous pigment and normals without increasing tier geometry", () => {
  for (const profile of ["low", "medium", "high"] as const) {
    const planet = createPlanet({ profile })
    const geometry = planet.mesh.geometry
    const positions = geometry.getAttribute("position"),
      colors = geometry.getAttribute("color"),
      normals = geometry.getAttribute("normal")
    const seen = new Map<string, number[]>()
    let shared = 0,
      maxEdgeContrast = 0
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i)
      const color = [colors.getX(i), colors.getY(i), colors.getZ(i)]
      const key = p.toArray().join(",")
      if (seen.has(key)) {
        expect(color).toEqual(seen.get(key))
        shared++
      }
      seen.set(key, color)
      expect(
        p.normalize().dot(new THREE.Vector3().fromBufferAttribute(normals, i)),
      ).toBeCloseTo(1, 5)
      if (i % 3 !== 2)
        maxEdgeContrast = Math.max(
          maxEdgeContrast,
          Math.abs(colors.getY(i) - colors.getY(i + 1)),
        )
    }
    expect(shared).toBeGreaterThan(100)
    expect(maxEdgeContrast).toBeLessThan(0.045)
    expect(positions.count).toBeLessThanOrEqual(
      PLANET_PROFILES[profile].maxTerrainVertices,
    )
    planet.dispose()
  }
})

it("authors three tuft silhouettes with six distinct curved/tapered profiles and a patch field with quiet gaps", () => {
  const geometry = createTuftGeometry()
  const p = geometry.getAttribute("position")
  expect(p.count / 3).toBe(48)
  const heights = new Set<number>()
  for (let blade = 0; blade < 6; blade++) {
    const start = blade * 24
    const rootLeft = new THREE.Vector3().fromBufferAttribute(p, start)
    const rootRight = new THREE.Vector3().fromBufferAttribute(p, start + 1)
    const tip = new THREE.Vector3().fromBufferAttribute(p, start + 22)
    heights.add(Math.round(tip.y * 100))
    expect(rootLeft.distanceTo(rootRight)).toBeGreaterThan(0.05)
    const root = rootLeft.add(rootRight).multiplyScalar(0.5)
    expect(Math.hypot(tip.x - root.x, tip.z - root.z)).toBeGreaterThan(0.06)
  }
  expect(heights.size).toBe(6)
  const densities = Array.from({ length: 200 }, (_, i) =>
    meadowDensity(
      new THREE.Vector3(
        Math.sin(i),
        Math.cos(i),
        Math.sin(i * 0.7),
      ).normalize(),
    ),
  )
  expect(densities.filter((value) => value < 0.05).length).toBeGreaterThan(20)
  expect(densities.filter((value) => value > 0.95).length).toBeGreaterThan(20)
  geometry.dispose()
})

it.each(["low", "medium", "high"] as const)(
  "bounds %s wind, roots, footprint and allocations across repeated updates/freeze/disposal",
  (profile) => {
    const grass = createGrass({ profile })
    const attribute = grass.mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute
    const rest = attribute.array.slice()
    const matrix = grass.mesh.instanceMatrix.array.slice()
    for (let i = 0; i < 1000; i++) {
      grass.update(i / 60, false)
      expect(grass.mesh.geometry.getAttribute("position")).toBe(attribute)
    }
    for (let i = 0; i < attribute.count; i++) {
      expect(Math.abs(attribute.getX(i) - rest[i * 3])).toBeLessThanOrEqual(
        0.033,
      )
      expect(attribute.getY(i)).toBe(rest[i * 3 + 1])
      if (attribute.getY(i) === 0) expect(attribute.getX(i)).toBe(rest[i * 3])
      expect(
        Math.hypot(attribute.getX(i), attribute.getZ(i)) * 1.22,
      ).toBeLessThan(grass.maxFootprint)
    }
    const frozen = attribute.array.slice(),
      version = attribute.version
    grass.update(100, true)
    grass.update(Number.NaN, false)
    expect(attribute.array).toEqual(frozen)
    expect(attribute.version).toBe(version)
    expect(grass.mesh.instanceMatrix.array).toEqual(matrix)
    expect(grass.mesh.count).toBe(PLANET_PROFILES[profile].grassCount)
    const dispose = vi.spyOn(grass.mesh.geometry, "dispose")
    grass.dispose()
    grass.dispose()
    grass.update(0, false)
    expect(attribute.array).toEqual(frozen)
    expect(dispose).toHaveBeenCalledOnce()
  },
)

it("owns two bounded contact shades without texture allocation or duplicate disposal", () => {
  const shade = createContactShadow()
  const first = shade.object.children[0] as THREE.Mesh
  const geometry = vi.spyOn(first.geometry, "dispose")
  const material = vi.spyOn(first.material as THREE.Material, "dispose")
  const point = new THREE.Vector3(1, 2, 3),
    normal = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < 1000; i++) shade.place(0, point, normal, 0.05)
  expect(shade.object.children).toHaveLength(2)
  expect(first.position.y).toBeCloseTo(2.003)
  shade.place(1, point, normal, 0.5)
  expect(shade.object.children[1].visible).toBe(false)
  shade.place(9, point, normal, 0)
  shade.dispose()
  shade.dispose()
  shade.place(0, point, normal, 0)
  expect(geometry).toHaveBeenCalledOnce()
  expect(material).toHaveBeenCalledOnce()
})
