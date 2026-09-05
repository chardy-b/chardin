import * as THREE from "three"

import type { MovementIntent, TravelerState } from "@/engine/contracts"

const WALK_SPEED = 1.65
const TURN_SPEED = 1.9

export function createInitialTravelerState(radius: number): TravelerState {
  return {
    position: new THREE.Vector3(0, radius, 0),
    forward: new THREE.Vector3(0, 0, -1),
  }
}

export function stepTraveler(
  state: TravelerState,
  intent: MovementIntent,
  deltaSeconds: number,
  radius: number,
): TravelerState {
  const position = state.position.clone().normalize().multiplyScalar(radius)
  const up = position.clone().normalize()
  const forward = state.forward
    .clone()
    .addScaledVector(up, -state.forward.dot(up))
    .normalize()

  if (intent.turn !== 0) {
    forward.applyAxisAngle(up, -intent.turn * TURN_SPEED * deltaSeconds)
  }

  if (intent.forward !== 0) {
    const right = new THREE.Vector3().crossVectors(forward, up).normalize()
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      right,
      (intent.forward * WALK_SPEED * deltaSeconds) / radius,
    )
    position.applyQuaternion(rotation).normalize().multiplyScalar(radius)
    forward.applyQuaternion(rotation)
  }

  const nextUp = position.clone().normalize()
  forward.addScaledVector(nextUp, -forward.dot(nextUp)).normalize()

  return { position, forward }
}
