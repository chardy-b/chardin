import * as THREE from "three"
import { createToonMaterial } from "@/engine/render/toon-material"

import { createSurfaceFrame } from "@/engine/world/surface-frame"
import {
  LANDMARK_DIRECTION,
  SPAWN_DIRECTION,
  createLandmarkAnchor,
} from "@/engine/world/landmark-anchor"
import {
  PLANET_PROFILES,
  PLANET_RADIUS,
  PLANET_SEED,
  SPAWN_CLEARING_ANGLE,
  createPlanetSurfaceSampler,
  createTerrainGeometry,
  type PlanetSurfaceSample,
  type PlanetProfile,
} from "@/engine/world/planet"

const MAX_FOOTPRINT = 0.28
const GRASS_COLORS = [0x748951, 0x84945e, 0x90986a, 0x6d8252] as const

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Three original two-leaf tuft silhouettes: open cup, low fan, swept pennant.
 * Separate roots and six bowed/tapered profiles create overlapping meadow masses.
 * Four strips per blade; one 48-triangle cluster / one instanced draw per tier. */
export function createTuftGeometry() {
  const positions: number[] = []
  // height, bow, width, azimuth, root x/z. Each consecutive pair is one tuft.
  const profiles = [
    [0.42, 0.085, 0.044, 0, -0.06, -0.01],
    [0.28, -0.07, 0.04, 0.3, -0.06, -0.01],
    [0.21, 0.11, 0.05, 1.4, 0.065, -0.035],
    [0.25, -0.095, 0.048, 1.1, 0.065, -0.035],
    [0.35, 0.08, 0.042, 3.1, 0.005, 0.055],
    [0.31, 0.12, 0.038, 3.8, 0.005, 0.055],
  ]
  for (const [height, bow, width, angle, rootX, rootZ] of profiles) {
    const point = (t: number, side: number) => {
      const x = bow * t * t + side * width * (1 - t) * (0.75 + t)
      const z = 0.018 * Math.sin(t * Math.PI)
      return [
        rootX + x * Math.cos(angle) - z * Math.sin(angle),
        height * t,
        rootZ + x * Math.sin(angle) + z * Math.cos(angle),
      ]
    }
    for (let segment = 0; segment < 4; segment++) {
      const t = segment / 4,
        next = (segment + 1) / 4
      positions.push(
        ...point(t, -1),
        ...point(t, 1),
        ...point(next, -1),
        ...point(t, 1),
        ...point(next, 1),
        ...point(next, -1),
      )
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/** Patch-scale field shared by all tiers; rejection leaves deliberate quiet gaps. */
export function meadowDensity(direction: THREE.Vector3) {
  const { x, y, z } = direction
  const wave = Math.sin(x * 19 + z * 11) * Math.sin(y * 17 - z * 9)
  return THREE.MathUtils.smoothstep(wave, -0.45, 0.55)
}

export function createGrass({
  seed = PLANET_SEED,
  profile = "medium",
  count,
  center = new THREE.Vector3(),
}: {
  seed?: number
  profile?: PlanetProfile
  count?: number
  center?: THREE.Vector3
} = {}) {
  const settings = PLANET_PROFILES[profile] ?? PLANET_PROFILES.medium
  const requested = count === undefined ? settings.grassCount : count
  const safeCount = Number.isFinite(requested)
    ? THREE.MathUtils.clamp(
        Math.floor(requested),
        0,
        PLANET_PROFILES.high.grassCount,
      )
    : requested === Number.NEGATIVE_INFINITY
      ? 0
      : settings.grassCount
  const geometry = createTuftGeometry()
  const material = createToonMaterial({
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, safeCount)
  mesh.name = "Clustered meadow grass"
  mesh.receiveShadow = true
  const rng = random(seed | 0)
  const object = new THREE.Object3D()
  const landmarkClearing = createLandmarkAnchor(
    center,
    PLANET_RADIUS,
  ).clearingAngle
  const footprintAngle = MAX_FOOTPRINT / PLANET_RADIUS
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const surfaceGeometry = createTerrainGeometry(profile)
  const surfaceSampler = createPlanetSurfaceSampler(surfaceGeometry, center)
  const surface: PlanetSurfaceSample = {
    radius: PLANET_RADIUS,
    normal: new THREE.Vector3(),
    position: new THREE.Vector3(),
  }
  let accepted = 0
  let candidate = 0
  while (accepted < safeCount && candidate < safeCount * 32 + 128) {
    const band = candidate % 8
    const y = -1 + (2 * (band + rng())) / 8
    const radial = Math.sqrt(Math.max(0, 1 - y * y))
    const heading = candidate * goldenAngle + (rng() - 0.5) * 0.28
    const direction = new THREE.Vector3(
      Math.cos(heading) * radial,
      y,
      Math.sin(heading) * radial,
    ).normalize()
    candidate += 1
    if (
      direction.angleTo(SPAWN_DIRECTION) <
        SPAWN_CLEARING_ANGLE + footprintAngle ||
      direction.angleTo(LANDMARK_DIRECTION) < landmarkClearing + footprintAngle
    )
      continue

    if (rng() > 0.12 + meadowDensity(direction) * 0.88) continue
    surfaceSampler.sample(direction, surface)
    const frame = createSurfaceFrame(
      center,
      surface.position,
      new THREE.Vector3(0, 0, -1),
    )
    const basis = new THREE.Matrix4().makeBasis(
      frame.right,
      frame.up,
      frame.forward.clone().negate(),
    )
    object.position.copy(surface.position)
    object.quaternion.setFromRotationMatrix(basis)
    object.rotateY(rng() * Math.PI * 2)
    const clusterWave = 0.78 + 0.22 * Math.sin(heading * 3 + y * 7)
    object.scale.set(
      0.72 + rng() * 0.5,
      (0.68 + rng() * 0.65) * clusterWave,
      0.72 + rng() * 0.5,
    )
    object.updateMatrix()
    mesh.setMatrixAt(accepted, object.matrix)
    mesh.setColorAt(
      accepted,
      new THREE.Color(GRASS_COLORS[Math.floor(rng() * GRASS_COLORS.length)]),
    )
    accepted += 1
  }
  mesh.count = accepted
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  surfaceGeometry.dispose()
  const rest = new Float32Array(geometry.getAttribute("position").array)
  const position = geometry.getAttribute("position") as THREE.BufferAttribute
  position.setUsage(THREE.DynamicDrawUsage)
  // Geometry deformation is shared by color/depth/normal passes. No shader
  // override mismatch, per-instance upload, timer or per-frame allocation.
  geometry.boundingSphere!.radius += 0.035
  mesh.boundingSphere!.radius += 0.05
  let lastWind = Number.NaN
  let disposed = false
  return {
    mesh,
    maxFootprint: MAX_FOOTPRINT,
    update(seconds: number, reducedMotion: boolean) {
      if (disposed || !Number.isFinite(seconds) || reducedMotion) return
      const wind =
        Math.sin(seconds * 1.15) * 0.024 + Math.sin(seconds * 0.47) * 0.008
      if (wind === lastWind) return
      lastWind = wind
      for (let i = 0; i < position.count; i++) {
        const bend = Math.pow(rest[i * 3 + 1]! / 0.43, 2)
        position.setX(i, rest[i * 3]! + wind * bend)
      }
      position.needsUpdate = true
    },
    clearings: { spawn: SPAWN_CLEARING_ANGLE, landmark: landmarkClearing },
    dispose() {
      if (disposed) return
      disposed = true
      mesh.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
