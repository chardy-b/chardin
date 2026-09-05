import * as THREE from "three"

import type { TravelerState } from "@/engine/contracts"
import { transportForward } from "@/engine/world/surface-frame"

export interface ThirdPersonCameraState {
  position: THREE.Vector3
  target: THREE.Vector3
  up: THREE.Vector3
  forward: THREE.Vector3
}

interface ThirdPersonCameraConfig {
  height: number
  distance: number
  targetHeight: number
}

const DEFAULT_CONFIG: ThirdPersonCameraConfig = {
  height: 2.25,
  distance: 4.15,
  targetHeight: 0.55,
}

export function createThirdPersonCameraState(
  traveler: TravelerState,
  planetCenter: THREE.Vector3,
): ThirdPersonCameraState {
  const up = traveler.position.clone().sub(planetCenter).normalize()
  return updateThirdPersonCamera(
    {
      position: traveler.position.clone(),
      target: traveler.position.clone(),
      up,
      forward: traveler.forward.clone(),
    },
    traveler,
    planetCenter,
    DEFAULT_CONFIG,
  )
}

export function updateThirdPersonCamera(
  previous: ThirdPersonCameraState,
  traveler: TravelerState,
  planetCenter: THREE.Vector3,
  config: ThirdPersonCameraConfig = DEFAULT_CONFIG,
): ThirdPersonCameraState {
  const up = traveler.position.clone().sub(planetCenter).normalize()
  const forward = transportForward(previous.up, up, previous.forward)
  // Align the transported rig with the actor heading without introducing world-up.
  if (forward.dot(traveler.forward) < 1 - 1e-12) forward.copy(traveler.forward)
  return {
    position: traveler.position
      .clone()
      .addScaledVector(up, config.height)
      .addScaledVector(forward, -config.distance),
    target: traveler.position.clone().addScaledVector(up, config.targetHeight),
    up,
    forward,
  }
}
