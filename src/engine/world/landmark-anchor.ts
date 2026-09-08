import * as THREE from "three"

import type { SurfaceFrame } from "@/engine/contracts"
import { createSurfaceFrame } from "@/engine/world/surface-frame"

export const SPAWN_DIRECTION = Object.freeze(new THREE.Vector3(0, 1, 0))
export const LANDMARK_DIRECTION = Object.freeze(
  new THREE.Vector3(0.72, 0.38, 0.58).normalize(),
)

export interface LandmarkAnchor {
  position: THREE.Vector3
  frame: SurfaceFrame
  clearingAngle: number
}

/** The original pavilion reservation, shared by every grass profile. */
export function createLandmarkAnchor(
  center = new THREE.Vector3(),
  radius = 5,
): LandmarkAnchor {
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 5
  const position = center
    .clone()
    .addScaledVector(LANDMARK_DIRECTION, safeRadius)
  const frame = createSurfaceFrame(
    center,
    position,
    new THREE.Vector3(0, 0, -1),
  )
  return { position, frame, clearingAngle: 0.75 }
}
