import * as THREE from "three"

import type { ControlIntent, TravelerState } from "@/engine/contracts"
import { transportForward } from "@/engine/world/surface-frame"

export interface PlayerMotorConfig {
  planetCenter: THREE.Vector3
  groundRadius: number
  walkSpeed: number
  runSpeed: number
  turnSpeed: number
  jumpSpeed: number
  gravity: number
}

export type { SurfaceCollider } from "@/engine/world/skyspace-collider"
import type { SurfaceCollider } from "@/engine/world/skyspace-collider"
import { stepSupportedMotor } from "@/engine/player/supported-motor"

export function createInitialPlayerState(
  config: PlayerMotorConfig,
): TravelerState {
  return {
    velocity: new THREE.Vector3(),
    supportUp: new THREE.Vector3(0, 1, 0),
    supportId: "planet",
    previousGroundedSupport: "planet",
    position: config.planetCenter
      .clone()
      .add(new THREE.Vector3(0, config.groundRadius, 0)),
    forward: new THREE.Vector3(0, 0, -1),
    radialVelocity: 0,
    grounded: true,
    locomotion: "idle",
  }
}

export function stepPlayerMotor(
  state: TravelerState,
  intent: ControlIntent,
  config: PlayerMotorConfig,
  dt: number,
  collider?: SurfaceCollider,
): TravelerState {
  if (
    collider &&
    !(
      state.previousGroundedSupport === "planet" &&
      collider.nearLandmark?.(state.position) === false
    )
  )
    return stepSupportedMotor(state, intent, config, dt, collider)
  const radial = state.position.clone().sub(config.planetCenter)
  const radius = Math.max(radial.length(), config.groundRadius)
  const up = radial.normalize()
  let forward = state.forward
    .clone()
    .addScaledVector(up, -state.forward.dot(up))
    .normalize()

  if (intent.move.x !== 0) {
    forward
      .applyAxisAngle(up, -intent.move.x * config.turnSpeed * dt)
      .normalize()
  }

  const nextUp = up.clone()
  if (intent.move.y !== 0) {
    const speed = intent.run ? config.runSpeed : config.walkSpeed
    const axis = up.clone().cross(forward).normalize()
    nextUp
      .applyAxisAngle(axis, (intent.move.y * speed * dt) / radius)
      .normalize()
    forward = transportForward(up, nextUp, forward)
  }

  let radialVelocity = state.radialVelocity
  let grounded = state.grounded
  if (grounded && intent.jumpPressed) {
    grounded = false
    radialVelocity = config.jumpSpeed
  }
  if (!grounded) radialVelocity -= config.gravity * dt

  let nextRadius = radius + radialVelocity * dt
  if (nextRadius <= config.groundRadius) {
    nextRadius = config.groundRadius
    radialVelocity = 0
    grounded = true
  }

  return {
    velocity: nextUp.clone().multiplyScalar(radialVelocity),
    supportUp: nextUp.clone(),
    supportId: grounded ? "planet" : "air",
    previousGroundedSupport: "planet",
    position: config.planetCenter.clone().addScaledVector(nextUp, nextRadius),
    forward,
    radialVelocity,
    grounded,
    locomotion: grounded
      ? intent.move.y === 0
        ? "idle"
        : intent.run
          ? "run"
          : "walk"
      : "airborne",
  }
}
