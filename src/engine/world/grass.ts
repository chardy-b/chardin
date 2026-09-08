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

const MAX_FOOTPRINT = 0.09
const GRASS_COLORS = [0x6e853f, 0x84934b, 0x9a9149, 0x60783d] as const

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

function createTuftGeometry() {
  const positions: number[] = []
  const halfWidth = 0.035
  for (let blade = 0; blade < 3; blade += 1) {
    const angle = (blade * Math.PI) / 3
    const right = new THREE.Vector3(
      Math.cos(angle),
      0,
      Math.sin(angle),
    ).multiplyScalar(halfWidth)
    const lean = new THREE.Vector3(
      -Math.sin(angle),
      0,
      Math.cos(angle),
    ).multiplyScalar(0.035)
    const left = right.clone().negate()
    const tip = lean.setY(0.34)
    positions.push(...left.toArray(), ...right.toArray(), ...tip.toArray())
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
  while (accepted < safeCount && candidate < safeCount * 8 + 32) {
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
  let disposed = false
  return {
    mesh,
    maxFootprint: MAX_FOOTPRINT,
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
