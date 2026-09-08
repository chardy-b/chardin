import * as THREE from "three"

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

const PALETTE = [
  new THREE.Color(0x587344),
  new THREE.Color(0x6f8350),
  new THREE.Color(0x87915a),
  new THREE.Color(0x9a8b50),
  new THREE.Color(0x4e6842),
] as const
const EARTH = new THREE.Color(0xa3744b)

function hash(seed: number, value: number) {
  let result = (seed ^ Math.imul(value + 1, 0x9e3779b1)) >>> 0
  result = Math.imul(result ^ (result >>> 16), 0x21f0aaad)
  result = Math.imul(result ^ (result >>> 15), 0x735a2d97)
  return ((result ^ (result >>> 15)) >>> 0) / 4_294_967_296
}

function faceColor(normal: THREE.Vector3, seed: number, face: number) {
  const region =
    normal.dot(new THREE.Vector3(0.62, 0.18, -0.76)) * 0.8 +
    normal.dot(new THREE.Vector3(-0.22, 0.95, 0.21)) * 0.35
  const inSpawnPatch = normal.angleTo(SPAWN_DIRECTION) < SPAWN_PATCH_ANGLE
  if (inSpawnPatch) {
    return EARTH.clone().offsetHSL(0, 0, (hash(seed, face) - 0.5) * 0.055)
  }
  const paletteIndex =
    Math.abs(Math.floor(region * 2.2 + hash(seed, face) * 2.1)) % PALETTE.length
  return PALETTE[paletteIndex]!.clone().offsetHSL(
    (hash(seed + 17, face) - 0.5) * 0.012,
    0,
    (hash(seed + 31, face) - 0.5) * 0.045,
  )
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
  for (let offset = 0; offset < positions.count; offset += 3) {
    center
      .set(0, 0, 0)
      .add(new THREE.Vector3().fromBufferAttribute(positions, offset))
      .add(new THREE.Vector3().fromBufferAttribute(positions, offset + 1))
      .add(new THREE.Vector3().fromBufferAttribute(positions, offset + 2))
      .normalize()
    const color = faceColor(center, seed | 0, offset / 3)
    for (let vertex = 0; vertex < 3; vertex += 1)
      color.toArray(colors, (offset + vertex) * 3)
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.94,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = "Authored grass planet"
  let disposed = false
  return {
    mesh,
    profile: settings,
    surfaceAt: (direction: THREE.Vector3) =>
      samplePlanetSurface(mesh, direction),
    dispose() {
      if (disposed) return
      disposed = true
      geometry.dispose()
      material.dispose()
    },
  }
}
