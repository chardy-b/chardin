import * as THREE from "three"
import { createToonMaterial } from "@/engine/render/toon-material"

import { SPAWN_DIRECTION } from "@/engine/world/landmark-anchor"

export const PLANET_RADIUS = 5
export const PLANET_SEED = 0x43484152
export const SPAWN_CLEARING_ANGLE = 0.2
export const SPAWN_PATCH_ANGLE = 0.19

export const PLANET_PROFILES = {
  low: { terrainDetail: 5, maxTerrainVertices: 2_160, grassCount: 520 },
  medium: { terrainDetail: 6, maxTerrainVertices: 2_940, grassCount: 960 },
  high: { terrainDetail: 7, maxTerrainVertices: 3_840, grassCount: 1_520 },
} as const

export type PlanetProfile = keyof typeof PLANET_PROFILES

const MEADOW = new THREE.Color(0x6d8054)
const SHADE = new THREE.Color(0x61764e)
const EARTH = new THREE.Color(0x948363)

/** Continuous, low-frequency pigment fields, independent of triangulation.
 * Equal positions always share pigment and normals, including across LODs. */
export function terrainColor(normal: THREE.Vector3, seed = PLANET_SEED) {
  const phase = (seed % 997) / 997
  const region = 0.5 + 0.5 * Math.sin(normal.x * 3 + normal.z * 2 + phase)
  const color = MEADOW.clone().lerp(SHADE, region * 0.65)
  const clearing =
    1 -
    THREE.MathUtils.smoothstep(
      normal.angleTo(SPAWN_DIRECTION),
      SPAWN_PATCH_ANGLE * 0.55,
      SPAWN_CLEARING_ANGLE + 0.1,
    )
  return color.lerp(EARTH, clearing * 0.7)
}

export type PlanetSurfaceSample = {
  radius: number
  normal: THREE.Vector3
  position: THREE.Vector3
}

/**
 * Builds a bounded radial query for the immutable, centered, convex and
 * non-indexed icosphere returned by createTerrainGeometry. Each triangle is a
 * supporting plane, so the first surface along a center-out ray is the minimum
 * positive plane intersection. This avoids scene traversal and raycast result
 * allocation while retaining the rendered facets as the source of truth.
 */
export function createPlanetSurfaceSampler(
  geometry: THREE.BufferGeometry,
  center = new THREE.Vector3(),
) {
  const positions = geometry.getAttribute("position")
  const faceCount = Math.floor(positions.count / 3)
  const normals = new Float64Array(faceCount * 3)
  const constants = new Float64Array(faceCount)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const edge = new THREE.Vector3()
  const normal = new THREE.Vector3()

  for (let face = 0; face < faceCount; face += 1) {
    const offset = face * 3
    a.fromBufferAttribute(positions, offset)
    b.fromBufferAttribute(positions, offset + 1)
    c.fromBufferAttribute(positions, offset + 2)
    normal.subVectors(c, b).cross(edge.subVectors(a, b)).normalize()
    if (normal.dot(a) < 0) normal.negate()
    normals.set(normal.toArray(), offset)
    constants[face] = normal.dot(a)
  }

  const origin = center.clone()
  return {
    faceCount,
    sample(
      direction: THREE.Vector3,
      target: PlanetSurfaceSample = {
        radius: PLANET_RADIUS,
        normal: new THREE.Vector3(),
        position: new THREE.Vector3(),
      },
    ) {
      const lengthSq = direction.lengthSq()
      const dx =
        lengthSq > 1e-12 ? direction.x / Math.sqrt(lengthSq) : SPAWN_DIRECTION.x
      const dy =
        lengthSq > 1e-12 ? direction.y / Math.sqrt(lengthSq) : SPAWN_DIRECTION.y
      const dz =
        lengthSq > 1e-12 ? direction.z / Math.sqrt(lengthSq) : SPAWN_DIRECTION.z
      let radius = Number.POSITIVE_INFINITY
      let selected = -1
      for (let face = 0; face < faceCount; face += 1) {
        const offset = face * 3
        const denominator =
          normals[offset]! * dx +
          normals[offset + 1]! * dy +
          normals[offset + 2]! * dz
        if (denominator <= 0) continue
        const distance = constants[face]! / denominator
        if (distance < radius) {
          radius = distance
          selected = offset
        }
      }
      if (selected < 0) {
        radius = PLANET_RADIUS
        target.normal.set(dx, dy, dz)
      } else {
        target.normal.fromArray(normals, selected)
      }
      target.radius = radius
      target.position.set(dx, dy, dz).multiplyScalar(radius).add(origin)
      return target
    },
  }
}

/** Convenience query for centered geometry with translation only; rotation, scale
 * and parent transforms are unsupported. Repeated queries must reuse a sampler. */
export function samplePlanetSurface(
  mesh: THREE.Mesh<THREE.BufferGeometry>,
  direction: THREE.Vector3,
) {
  const center = mesh.position
  return createPlanetSurfaceSampler(mesh.geometry, center).sample(direction)
}

export function createTerrainGeometry(profile: PlanetProfile = "medium") {
  const settings = PLANET_PROFILES[profile] ?? PLANET_PROFILES.medium
  return new THREE.IcosahedronGeometry(PLANET_RADIUS, settings.terrainDetail)
}

export function createPlanet({
  seed = PLANET_SEED,
  profile = "medium",
}: { seed?: number; profile?: PlanetProfile } = {}) {
  const settings = PLANET_PROFILES[profile] ?? PLANET_PROFILES.medium
  const geometry = createTerrainGeometry(profile)
  const positions = geometry.getAttribute("position")
  const colors = new Float32Array(positions.count * 3)
  const center = new THREE.Vector3()
  for (let offset = 0; offset < positions.count; offset++) {
    center.fromBufferAttribute(positions, offset).normalize()
    terrainColor(center, seed).toArray(colors, offset * 3)
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()
  // Radial normals soften the faceted surface without changing support geometry.
  const normals = new Float32Array(positions.count * 3)
  for (let i = 0; i < positions.count; i++)
    center
      .fromBufferAttribute(positions, i)
      .normalize()
      .toArray(normals, i * 3)
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3))
  const material = createToonMaterial({
    vertexColors: true,
    continuous: true,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = "Authored grass planet"
  mesh.receiveShadow = true
  const sampler = createPlanetSurfaceSampler(geometry)
  let disposed = false
  return {
    mesh,
    profile: settings,
    surfaceAt: (direction: THREE.Vector3, target?: PlanetSurfaceSample) => {
      const sample = sampler.sample(direction, target)
      sample.position.add(mesh.position)
      return sample
    },
    dispose() {
      if (disposed) return
      disposed = true
      geometry.dispose()
      material.dispose()
    },
  }
}
