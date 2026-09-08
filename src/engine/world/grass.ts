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

export type PlantSilhouette = "low" | "medium" | "accent"

/** Independently instanced original forms: broad creeping leaves, a folded
 * three-leaf fan, and a sparse two-stem accent. Never a radial starburst. */
export function createTuftGeometry(kind: PlantSilhouette = "medium") {
  const positions: number[] = [],
    colors: number[] = []
  // height, bow, width, azimuth, root x/z
  const profiles = {
    low: [
      [0.11, 0.14, 0.068, 0, -0.015, 0],
      [0.13, -0.13, 0.065, 0.25, 0.015, 0],
      [0.09, 0.1, 0.06, 1.1, 0, 0.01],
    ],
    medium: [
      [0.27, 0.09, 0.055, 0, -0.018, 0],
      [0.22, -0.095, 0.052, 0.15, 0.018, 0],
      [0.19, 0.06, 0.05, 0.5, 0, 0.015],
    ],
    accent: [
      [0.42, 0.065, 0.026, 0, -0.012, 0],
      [0.31, 0.11, 0.037, 0.3, 0.012, 0],
    ],
  }[kind]
  for (const [height, bow, width, angle, rootX, rootZ] of profiles) {
    const point = (t: number, side: number) => {
      const breadth = Math.sin(Math.PI * t) * 0.85 + (1 - t) * 0.15
      const x = bow * t * t + side * width * breadth
      const z = 0.022 * Math.sin(t * Math.PI)
      return [
        rootX + x * Math.cos(angle) - z * Math.sin(angle),
        height * t,
        rootZ + x * Math.sin(angle) + z * Math.cos(angle),
      ]
    }
    for (let segment = 0; segment < 4; segment++) {
      const t = segment / 4,
        next = (segment + 1) / 4
      for (const [height, side] of [
        [t, -1],
        [t, 1],
        [next, -1],
        [t, 1],
        [next, 1],
        [next, -1],
      ]) {
        positions.push(...point(height, side))
        const value = THREE.MathUtils.lerp(0.72, 1, height)
        colors.push(value, value, value)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/** Broad connected drifts, with true negative space shared by every tier. */
export function meadowDensity(direction: THREE.Vector3) {
  const { x, y, z } = direction
  const wave =
    Math.sin(x * 7 + z * 5 + Math.sin(y * 4)) * Math.cos(y * 8 - z * 3)
  return THREE.MathUtils.smoothstep(wave, -0.2, 0.5)
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
  const kinds: PlantSilhouette[] = ["low", "medium", "accent"]
  const geometries = kinds.map(createTuftGeometry)
  const material = createToonMaterial({
    side: THREE.DoubleSide,
    vertexColors: true,
    continuous: true,
  })
  const mesh = new THREE.Group()
  mesh.name = "Composed meadow"
  const batches = geometries.map((geometry, index) => {
    const batch = new THREE.InstancedMesh(geometry, material, safeCount)
    batch.name = `Meadow ${kinds[index]}`
    batch.count = 0
    batch.receiveShadow = true
    mesh.add(batch)
    return batch
  })
  const addresses: Array<[number, number]> = []
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

    const density = meadowDensity(direction)
    if (rng() > density * density) continue
    // Tall contours belong to the hearts of masses, never their quiet edges.
    const choice = rng()
    const kind =
      density > 0.8 && choice > 0.94
        ? 2
        : density > 0.5 && choice > 0.66
          ? 1
          : 0
    const batch = batches[kind]!
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
    object.rotateY(
      Math.sin(direction.x * 5 + direction.z * 3) * 1.2 + rng() * 0.7,
    )
    const clusterWave = 0.78 + 0.22 * Math.sin(heading * 3 + y * 7)
    object.scale.set(
      0.72 + rng() * 0.5,
      (0.68 + rng() * 0.65) * clusterWave,
      0.72 + rng() * 0.5,
    )
    object.updateMatrix()
    batch.setMatrixAt(batch.count, object.matrix)
    addresses.push([kind, batch.count])
    batch.setColorAt(
      batch.count,
      new THREE.Color(GRASS_COLORS[kind]!).lerp(
        new THREE.Color(GRASS_COLORS[3]),
        (1 - density) * 0.7 + rng() * 0.12,
      ),
    )
    batch.count++
    accepted += 1
  }
  const windBuffers = batches.map((batch, index) => {
    batch.instanceMatrix = new THREE.InstancedBufferAttribute(
      batch.instanceMatrix.array.slice(0, batch.count * 16),
      16,
    )
    if (batch.instanceColor)
      batch.instanceColor = new THREE.InstancedBufferAttribute(
        batch.instanceColor.array.slice(0, batch.count * 3),
        3,
      )
    batch.instanceMatrix.needsUpdate = true
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true
    batch.computeBoundingSphere()
    const geometry = geometries[index]!
    const position = geometry.getAttribute("position") as THREE.BufferAttribute
    const rest = new Float32Array(position.array)
    position.setUsage(THREE.DynamicDrawUsage)
    geometry.boundingSphere!.radius += 0.035
    batch.boundingSphere!.radius += 0.05
    return { position, rest }
  })
  surfaceGeometry.dispose()
  let lastTime = Number.NaN
  let disposed = false
  return {
    mesh,
    batches,
    count: accepted,
    getMatrixAt(index: number, target: THREE.Matrix4) {
      const [kind, offset] = addresses[index]!
      batches[kind]!.getMatrixAt(offset, target)
    },
    maxFootprint: MAX_FOOTPRINT,
    update(seconds: number, reducedMotion: boolean) {
      if (disposed || !Number.isFinite(seconds) || reducedMotion) return
      if (seconds === lastTime) return
      lastTime = seconds
      // Species have independent phase and amplitude. Positions are deformed
      // on the CPU so color, normal and shadow passes share identical geometry.
      windBuffers.forEach(({ position, rest }, kind) => {
        const wind =
          Math.sin(seconds * 1.15 + kind * 1.7) * 0.024 +
          Math.sin(seconds * 0.47 + kind) * 0.008
        for (let i = 0; i < position.count; i++) {
          const bend = Math.pow(rest[i * 3 + 1]! / 0.43, 2)
          position.setX(i, rest[i * 3]! + wind * bend)
        }
        position.needsUpdate = true
      })
    },
    clearings: { spawn: SPAWN_CLEARING_ANGLE, landmark: landmarkClearing },
    dispose() {
      if (disposed) return
      disposed = true
      for (const batch of batches) batch.dispose()
      for (const geometry of geometries) geometry.dispose()
      mesh.clear()
      material.dispose()
    },
  }
}
