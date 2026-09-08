import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"

import {
  PLANET_PROFILES,
  PLANET_RADIUS,
  createPlanetSurfaceSampler,
  createPlanet,
  createTerrainGeometry,
  samplePlanetSurface,
} from "@/engine/world/planet"
import { createGrass } from "@/engine/world/grass"
import {
  LANDMARK_DIRECTION,
  SPAWN_DIRECTION,
} from "@/engine/world/landmark-anchor"

describe("authored planet", () => {
  it("creates deterministic, seeded face colors on a constant-radius surface", () => {
    const first = createPlanet({ seed: 121, profile: "medium" })
    const repeat = createPlanet({ seed: 121, profile: "medium" })
    const other = createPlanet({ seed: 122, profile: "medium" })
    const positions = first.mesh.geometry.getAttribute("position")
    const colors = first.mesh.geometry.getAttribute("color")

    expect(Array.from(colors.array)).toEqual(
      Array.from(repeat.mesh.geometry.getAttribute("color").array),
    )
    expect(Array.from(colors.array)).not.toEqual(
      Array.from(other.mesh.geometry.getAttribute("color").array),
    )
    expect(
      new Set(Array.from(colors.array).map((value) => value.toFixed(3))).size,
    ).toBeGreaterThan(8)
    for (let index = 0; index < positions.count; index += 1) {
      expect(
        new THREE.Vector3().fromBufferAttribute(positions, index).length(),
      ).toBeCloseTo(5, 5)
    }
    const sampledRadius = samplePlanetSurface(
      first.mesh,
      new THREE.Vector3(0, 1, 0),
    ).radius
    expect(sampledRadius).toBeGreaterThan(4.9)
    expect(sampledRadius).toBeLessThanOrEqual(5)
    first.dispose()
    repeat.dispose()
    other.dispose()
  })

  it("queries the rendered facet at face interiors and translated centers", () => {
    const planet = createPlanet({ profile: "medium" })
    planet.mesh.position.set(3, -4, 2)
    planet.mesh.updateMatrixWorld(true)
    const positions = planet.mesh.geometry.getAttribute("position")
    const raycaster = new THREE.Raycaster()
    const direction = new THREE.Vector3()
    const centroid = new THREE.Vector3()

    for (let offset = 0; offset < Math.min(positions.count, 90); offset += 3) {
      direction
        .set(0, 0, 0)
        .add(new THREE.Vector3().fromBufferAttribute(positions, offset))
        .add(new THREE.Vector3().fromBufferAttribute(positions, offset + 1))
        .add(new THREE.Vector3().fromBufferAttribute(positions, offset + 2))
        .normalize()
      const surface = planet.surfaceAt(direction)
      raycaster.set(
        planet.mesh.position.clone().addScaledVector(direction, 8),
        direction.clone().negate(),
      )
      const hit = raycaster.intersectObject(planet.mesh, false)[0]
      expect(hit).toBeDefined()
      expect(surface.position.distanceTo(hit!.point)).toBeLessThan(1e-5)
      expect(surface.normal.dot(direction)).toBeGreaterThan(0.98)
      expect(
        centroid.copy(surface.position).sub(planet.mesh.position).length(),
      ).toBeLessThan(PLANET_RADIUS)
    }
    planet.dispose()
  })

  it.each(["low", "medium", "high"] as const)(
    "matches Raycaster across %s face interiors, edges, vertices and seeded directions",
    (profile) => {
      const geometry = createTerrainGeometry(profile)
      const center = new THREE.Vector3(3, -4, 2)
      const mesh = new THREE.Mesh(geometry)
      mesh.position.copy(center)
      mesh.updateMatrixWorld(true)
      const sampler = createPlanetSurfaceSampler(geometry, center)
      const positions = geometry.getAttribute("position")
      const directions: THREE.Vector3[] = []
      let state = 121
      const seeded = () => {
        state = Math.imul(state ^ (state >>> 16), 0x45d9f3b)
        return ((state >>> 0) / 4_294_967_296) * 2 - 1
      }

      for (
        let offset = 0;
        offset < Math.min(positions.count, 30);
        offset += 3
      ) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, offset)
        const b = new THREE.Vector3().fromBufferAttribute(positions, offset + 1)
        const c = new THREE.Vector3().fromBufferAttribute(positions, offset + 2)
        directions.push(
          a.clone().add(b).add(c).normalize(),
          a.clone().add(b).normalize(),
          a.clone().normalize(),
        )
      }
      for (let index = 0; index < 64; index += 1)
        directions.push(
          new THREE.Vector3(seeded(), seeded(), seeded()).normalize(),
        )

      const raycaster = new THREE.Raycaster()
      for (const direction of directions) {
        raycaster.set(
          center.clone().addScaledVector(direction, PLANET_RADIUS + 1),
          direction.clone().negate(),
        )
        const expected = raycaster.intersectObject(mesh, false)[0]
        const actual = sampler.sample(direction)
        if (expected)
          expect(actual.position.distanceTo(expected.point)).toBeLessThan(1e-5)
        else {
          // Three's triangle inclusion can reject rays exactly on shared
          // edges/vertices; the convex surface remains continuous there.
          expect(actual.radius).toBeGreaterThan(4.9)
          expect(actual.radius).toBeLessThanOrEqual(PLANET_RADIUS)
        }
        expect(actual.normal.dot(direction)).toBeGreaterThan(0.98)
      }
      geometry.dispose()
    },
  )

  it("keeps every profile bounded and disposes resources idempotently", () => {
    for (const [name, profile] of Object.entries(PLANET_PROFILES)) {
      const planet = createPlanet({
        profile: name as keyof typeof PLANET_PROFILES,
      })
      expect(
        planet.mesh.geometry.getAttribute("position").count,
      ).toBeLessThanOrEqual(profile.maxTerrainVertices)
      const geometryDispose = vi.spyOn(planet.mesh.geometry, "dispose")
      const materialDispose = vi.spyOn(
        planet.mesh.material as THREE.Material,
        "dispose",
      )
      planet.dispose()
      planet.dispose()
      expect(geometryDispose).toHaveBeenCalledOnce()
      expect(materialDispose).toHaveBeenCalledOnce()
    }
  })
})

describe("instanced grass", () => {
  it("generates grass without general-purpose scene raycasts", () => {
    const raycast = vi.spyOn(THREE.Raycaster.prototype, "intersectObject")
    const grass = createGrass({ seed: 121, profile: "high" })
    expect(raycast).not.toHaveBeenCalled()
    grass.dispose()
    raycast.mockRestore()
  })

  it("is reproducible, seed-sensitive, radially seated and outward at both poles", () => {
    const first = createGrass({ seed: 121, profile: "high" })
    const repeat = createGrass({ seed: 121, profile: "high" })
    const other = createGrass({ seed: 122, profile: "high" })
    const matrix = new THREE.Matrix4()
    const repeatMatrix = new THREE.Matrix4()
    const otherMatrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()

    expect(first.mesh.count).toBe(PLANET_PROFILES.high.grassCount)
    for (let index = 0; index < first.mesh.count; index += 1) {
      first.mesh.getMatrixAt(index, matrix)
      repeat.mesh.getMatrixAt(index, repeatMatrix)
      other.mesh.getMatrixAt(index, otherMatrix)
      expect(matrix.elements).toEqual(repeatMatrix.elements)
      matrix.decompose(position, rotation, scale)
      expect(position.length()).toBeGreaterThan(4.9)
      expect(position.length()).toBeLessThanOrEqual(5)
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation)
      expect(up.dot(position.clone().normalize())).toBeGreaterThan(0.99999)
      expect(Number.isFinite(up.x + up.y + up.z)).toBe(true)
    }
    first.mesh.getMatrixAt(0, matrix)
    other.mesh.getMatrixAt(0, otherMatrix)
    expect(matrix.elements).not.toEqual(otherMatrix.elements)
    first.dispose()
    repeat.dispose()
    other.dispose()
  })

  it.each(["low", "medium", "high"] as const)(
    "fills every latitude band with distinct, exactly bounded %s transforms",
    (profile) => {
      for (const seed of [1, 121, 0x7fffffff]) {
        const grass = createGrass({ seed, profile })
        const matrix = new THREE.Matrix4()
        const position = new THREE.Vector3()
        const bands = Array.from({ length: 8 }, () => 0)
        const distinct = new Set<string>()
        let minY = 1
        let nearSpawn = 0
        expect(grass.mesh.count).toBe(PLANET_PROFILES[profile].grassCount)
        for (let index = 0; index < grass.mesh.count; index += 1) {
          grass.mesh.getMatrixAt(index, matrix)
          position.setFromMatrixPosition(matrix).normalize()
          minY = Math.min(minY, position.y)
          bands[Math.min(7, Math.floor(((position.y + 1) / 2) * 8))]! += 1
          distinct.add(
            matrix.elements.map((value) => value.toFixed(5)).join(","),
          )
          if (
            position.angleTo(SPAWN_DIRECTION) >= grass.clearings.spawn &&
            position.angleTo(SPAWN_DIRECTION) < grass.clearings.spawn + 0.15
          )
            nearSpawn += 1
        }
        expect(minY).toBeLessThan(-0.9)
        expect(bands.every((count) => count > 0)).toBe(true)
        expect(distinct.size).toBe(grass.mesh.count)
        expect(nearSpawn).toBeGreaterThan(0)
        grass.dispose()
      }
    },
  )

  it.each(["low", "medium", "high"] as const)(
    "seats every %s grass origin on the actual rendered triangles",
    (profile) => {
      const center = new THREE.Vector3(3, -4, 2)
      const planet = createPlanet({ profile })
      planet.mesh.position.copy(center)
      planet.mesh.updateMatrixWorld(true)
      const grass = createGrass({ profile, center })
      const matrix = new THREE.Matrix4()
      const position = new THREE.Vector3()
      const direction = new THREE.Vector3()
      const raycaster = new THREE.Raycaster()
      for (let index = 0; index < grass.mesh.count; index += 1) {
        grass.mesh.getMatrixAt(index, matrix)
        position.setFromMatrixPosition(matrix)
        direction.copy(position).sub(center).normalize()
        raycaster.set(
          center.clone().addScaledVector(direction, 8),
          direction.clone().negate(),
        )
        const hit = raycaster.intersectObject(planet.mesh, false)[0]
        expect(hit).toBeDefined()
        expect(position.distanceTo(hit!.point)).toBeLessThan(1e-5)
        expect(Number.isFinite(position.x + position.y + position.z)).toBe(true)
      }
      grass.dispose()
      planet.dispose()
    },
  )

  it("excludes spawn and landmark clearings by the full blade footprint", () => {
    const grass = createGrass({ seed: 121, profile: "high" })
    const matrix = new THREE.Matrix4()
    const point = new THREE.Vector3()
    const footprintAngle = grass.maxFootprint / 5
    for (let index = 0; index < grass.mesh.count; index += 1) {
      grass.mesh.getMatrixAt(index, matrix)
      point.setFromMatrixPosition(matrix).normalize()
      expect(point.angleTo(SPAWN_DIRECTION)).toBeGreaterThanOrEqual(
        grass.clearings.spawn + footprintAngle - 1e-6,
      )
      expect(point.angleTo(LANDMARK_DIRECTION)).toBeGreaterThanOrEqual(
        grass.clearings.landmark + footprintAngle - 1e-6,
      )
    }
    grass.dispose()
  })

  it("handles malformed counts conservatively and disposes every owner once", () => {
    for (const count of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const fallback = createGrass({ profile: "low", count })
      expect(fallback.mesh.count).toBe(PLANET_PROFILES.low.grassCount)
      fallback.dispose()
    }
    for (const count of [0, -1, Number.NEGATIVE_INFINITY]) {
      const empty = createGrass({ count })
      expect(empty.mesh.count).toBe(0)
      empty.dispose()
    }
    const grass = createGrass({ count: Number.MAX_SAFE_INTEGER })
    expect(grass.mesh.count).toBe(PLANET_PROFILES.high.grassCount)
    const geometryDispose = vi.spyOn(grass.mesh.geometry, "dispose")
    const materialDispose = vi.spyOn(
      grass.mesh.material as THREE.Material,
      "dispose",
    )
    const meshDispose = vi.spyOn(grass.mesh, "dispose")
    grass.dispose()
    grass.dispose()
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
    expect(meshDispose).toHaveBeenCalledOnce()
  })
})
