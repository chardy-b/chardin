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

export interface SurfaceCollider {
  groundRadiusAt(surfaceNormal: THREE.Vector3): number
}

export function createInitialPlayerState(
  config: PlayerMotorConfig,
): TravelerState {
  return {
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
): TravelerState {
  const radial = state.position.clone().sub(config.planetCenter)
  const radius = Math.max(radial.length(), config.groundRadius)
  const up = radial.normalize()
  let forward = state.forward
    .clone()
    .addScaledVector(up, -state.forward.dot(up))
    .normalize()

  if (intent.turn !== 0) {
    forward.applyAxisAngle(up, -intent.turn * config.turnSpeed * dt).normalize()
  }

  const nextUp = up.clone()
  if (intent.forward !== 0) {
    const speed = intent.run ? config.runSpeed : config.walkSpeed
    const axis = up.clone().cross(forward).normalize()
    nextUp
      .applyAxisAngle(axis, (intent.forward * speed * dt) / radius)
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
    position: config.planetCenter.clone().addScaledVector(nextUp, nextRadius),
    forward,
    radialVelocity,
    grounded,
    locomotion: grounded
      ? intent.forward === 0
        ? "idle"
        : intent.run
          ? "run"
          : "walk"
      : "airborne",
  }
}
