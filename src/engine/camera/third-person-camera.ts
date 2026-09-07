import * as THREE from "three"

import type { TravelerState } from "@/engine/contracts"
import { transportForward } from "@/engine/world/surface-frame"

export interface ThirdPersonCameraState {
  position: THREE.Vector3
  target: THREE.Vector3
  up: THREE.Vector3
  forward: THREE.Vector3
  yaw: number
  pitch: number
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

export const CAMERA_YAW_LIMIT = Math.PI * 0.72
export const CAMERA_PITCH_LIMIT = Math.PI * 0.1
const CAMERA_LOOK_SPEED = 1.8

export function applyCameraLook(
  state: ThirdPersonCameraState,
  look: { x: number; y: number },
  dt: number,
): ThirdPersonCameraState {
  return {
    ...state,
    yaw: THREE.MathUtils.clamp(
      state.yaw + look.x * CAMERA_LOOK_SPEED * dt,
      -CAMERA_YAW_LIMIT,
      CAMERA_YAW_LIMIT,
    ),
    pitch: THREE.MathUtils.clamp(
      state.pitch + look.y * CAMERA_LOOK_SPEED * dt,
      -CAMERA_PITCH_LIMIT,
      CAMERA_PITCH_LIMIT,
    ),
  }
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
      yaw: 0,
      pitch: 0,
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
  forward.applyAxisAngle(up, -previous.yaw).normalize()
  const horizontalDistance = config.distance * Math.cos(previous.pitch)
  const cameraHeight =
    config.height - config.distance * Math.sin(previous.pitch)
  return {
    position: traveler.position
      .clone()
      .addScaledVector(up, cameraHeight)
      .addScaledVector(forward, -horizontalDistance),
    target: traveler.position.clone().addScaledVector(up, config.targetHeight),
    up,
    forward,
    yaw: previous.yaw,
    pitch: previous.pitch,
  }
}
