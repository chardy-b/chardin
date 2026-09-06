import * as THREE from "three"

import type { SurfaceFrame } from "@/engine/contracts"

const EPSILON = 1e-12

function fallbackTangent(up: THREE.Vector3): THREE.Vector3 {
  const reference =
    Math.abs(up.x) <= Math.abs(up.y) && Math.abs(up.x) <= Math.abs(up.z)
      ? new THREE.Vector3(1, 0, 0)
      : Math.abs(up.y) <= Math.abs(up.z)
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1)
  return reference.addScaledVector(up, -reference.dot(up)).normalize()
}

export function transportForward(
  previousUp: THREE.Vector3,
  nextUp: THREE.Vector3,
  previousForward: THREE.Vector3,
): THREE.Vector3 {
  const from = previousUp.clone().normalize()
  const to = nextUp.clone().normalize()
  const transported = previousForward.clone()
  const dot = THREE.MathUtils.clamp(from.dot(to), -1, 1)

  if (dot < -1 + EPSILON) {
    // Antiparallel normals have infinitely many rotations; choose a stable axis.
    transported.applyAxisAngle(fallbackTangent(from), Math.PI)
  } else if (dot < 1 - EPSILON) {
    transported.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(from, to),
    )
  }

  transported.addScaledVector(to, -transported.dot(to))
  return transported.lengthSq() > EPSILON
    ? transported.normalize()
    : fallbackTangent(to)
}

export function createSurfaceFrame(
  center: THREE.Vector3,
  position: THREE.Vector3,
  previousForward: THREE.Vector3,
): SurfaceFrame {
  const up = position.clone().sub(center)
  if (up.lengthSq() <= EPSILON) up.set(0, 1, 0)
  else up.normalize()

  const forward = previousForward
    .clone()
    .addScaledVector(up, -previousForward.dot(up))
  if (forward.lengthSq() <= EPSILON) forward.copy(fallbackTangent(up))
  else forward.normalize()

  return {
    up,
    forward,
    right: forward.clone().cross(up).normalize(),
  }
}
