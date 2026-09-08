import * as THREE from "three"

import type { SurfaceCollider } from "@/engine/world/skyspace-collider"
import type { TravelerState } from "@/engine/contracts"
import { transportForward } from "@/engine/world/surface-frame"

export interface ThirdPersonCameraState {
  position: THREE.Vector3
  target: THREE.Vector3
  up: THREE.Vector3
  forward: THREE.Vector3
  yaw: number
  pitch: number
  mode?: "walking" | "eye" | "view" | "blocked"
  hideTraveler?: boolean
  transitioning?: boolean
}

export interface ThirdPersonCameraConfig {
  /** The compact interior rig must frame the room, including while walking. */
  hideTraveler?: boolean
  supportUp?: THREE.Vector3
  collider?: Pick<SurfaceCollider, "sweepCamera">
  viewTarget?: THREE.Vector3
  shoulder?: number
  compositionYaw?: number
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
  pitchLimit = CAMERA_PITCH_LIMIT,
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
      -pitchLimit,
      pitchLimit,
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
  const up =
    config.supportUp?.clone() ??
    traveler.position.clone().sub(planetCenter).normalize()
  // The motor owns the transported heading. Apply manual yaw exactly once;
  // transporting the already yawed camera forward can accumulate look on redraw.
  const forward = transportForward(up, up, traveler.forward)
  forward
    .applyAxisAngle(up, -previous.yaw + (config.compositionYaw ?? 0))
    .normalize()
  const right = new THREE.Vector3().crossVectors(forward, up).normalize()
  const horizontalDistance = config.distance * Math.cos(previous.pitch)
  const cameraHeight =
    config.height - config.distance * Math.sin(previous.pitch)
  const desired: ThirdPersonCameraState = {
    mode: "walking",
    hideTraveler: config.hideTraveler ?? false,
    position: traveler.position
      .clone()
      .addScaledVector(up, cameraHeight)
      .addScaledVector(forward, -horizontalDistance)
      .addScaledVector(right, config.shoulder ?? 0),
    target: traveler.position
      .clone()
      .addScaledVector(up, config.targetHeight)
      .addScaledVector(right, (config.shoulder ?? 0) * 0.65),
    up,
    forward,
    yaw: previous.yaw,
    pitch: previous.pitch,
  }
  const collider = config.collider
  if (!collider) return desired
  const eye = traveler.position.clone().addScaledVector(up, 1.25)
  const valid = (p: THREE.Vector3) => !collider.sweepCamera(p, p, 0.12)
  const eyePose = (mode: "eye" | "view"): ThirdPersonCameraState => {
    if (!valid(eye)) return { ...previous, mode: "blocked", hideTraveler: true }
    let target = config.viewTarget?.clone() ?? eye.clone().add(forward)
    if (mode === "view") {
      // Look rotates the view direction only, within a small aperture-centered
      // cone. It never moves the eye into a wall or animates a transition.
      const direction = target
        .sub(eye)
        .applyAxisAngle(up, -THREE.MathUtils.clamp(previous.yaw, -0.25, 0.25))
      const right = direction.clone().cross(up).normalize()
      direction.applyAxisAngle(
        right,
        THREE.MathUtils.clamp(previous.pitch, -0.2, 0.2),
      )
      target = eye.clone().add(direction)
    }
    return { ...desired, position: eye, target, mode, hideTraveler: true }
  }
  if (config.viewTarget) return eyePose("view")
  const shorten = (from: THREE.Vector3, to: THREE.Vector3) => {
    const hit = collider.sweepCamera(from, to, 0.12)
    if (!hit) return to
    const length = from.distanceTo(to)
    return from
      .clone()
      .lerp(to, Math.max(0, hit.time - 0.02 / Math.max(length, 1e-9)))
  }
  desired.position = shorten(desired.target, desired.position)
  const minimumDistance = previous.mode === "eye" ? 0.5 : 0.4
  if (desired.position.distanceTo(desired.target) < minimumDistance)
    return eyePose("eye")
  if (
    previous.mode !== "view" &&
    previous.mode !== "eye" &&
    previous.mode !== "blocked" &&
    valid(previous.position)
  )
    desired.position = shorten(previous.position, desired.position)
  // The history sweep can shorten again or strand the camera ahead of the
  // actor after a turn. Check the final pose, including the reserved avatar
  // capsule (.35 radius / 1.30 height), before accepting a walking camera.
  const offset = desired.position.clone().sub(traveler.position)
  const axisHeight = THREE.MathUtils.clamp(offset.dot(up), 0.35, 0.95)
  const avatarClearance = offset.clone().addScaledVector(up, -axisHeight)
  if (
    desired.position.distanceTo(desired.target) < minimumDistance ||
    avatarClearance.length() < 0.35 + 0.12 + 0.02 ||
    offset.dot(forward) >= 0 ||
    !valid(desired.position) ||
    collider.sweepCamera(desired.target, desired.position, 0.12)
  )
    return eyePose("eye")
  return desired
}

/** The same reserved avatar capsule as the obstruction resolver. Visibility
 * releases with extra clearance, independently of a moving rig's convergence. */
export function cameraIntersectsTraveler(
  position: THREE.Vector3,
  feet: THREE.Vector3,
  up: THREE.Vector3,
  wasHidden = false,
) {
  const x = position.x - feet.x,
    y = position.y - feet.y,
    z = position.z - feet.z
  const height = THREE.MathUtils.clamp(
    x * up.x + y * up.y + z * up.z,
    0.35,
    0.95,
  )
  return (
    Math.hypot(x - up.x * height, y - up.y * height, z - up.z * height) <
    0.35 + 0.12 + 0.02 + (wasHidden ? 0.1 : 0)
  )
}

/** Fixed-step transition; rendering only interpolates these immutable samples.
 * Both the travel path and the final sightline must remain obstruction-free. */
export function easeCameraTransition(
  previous: ThirdPersonCameraState,
  desired: ThirdPersonCameraState,
  seconds: number,
  collider?: Pick<SurfaceCollider, "sweepCamera">,
): ThirdPersonCameraState {
  if (
    seconds <= 0 ||
    (!previous.transitioning && previous.mode === desired.mode)
  )
    return desired
  const t = 1 - Math.exp(-seconds / 0.12)
  const position = previous.position.clone().lerp(desired.position, t)
  const target = previous.target.clone().lerp(desired.target, t)
  const up = previous.up.clone().lerp(desired.up, t).normalize()
  if (
    collider &&
    (collider.sweepCamera(previous.position, position, 0.12) ||
      collider.sweepCamera(target, position, 0.12))
  )
    return desired
  const transitioning =
    position.distanceTo(desired.position) + target.distanceTo(desired.target) >
    0.001
  return {
    ...desired,
    position: transitioning ? position : desired.position,
    target: transitioning ? target : desired.target,
    up,
    transitioning,
    // Architectural suppression belongs to the requested rig. The rendered
    // camera's capsule clearance owns proximity suppression, not convergence:
    // a moving destination can keep this transition active indefinitely.
    hideTraveler: desired.hideTraveler,
  }
}
