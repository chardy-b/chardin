import * as THREE from "three"
import type { ControlIntent, TravelerState } from "@/engine/contracts"
import type { PlayerMotorConfig } from "@/engine/player/player-motor"
import type { SurfaceCollider } from "@/engine/world/skyspace-collider"
import { transportForward } from "@/engine/world/surface-frame"

export const CAPSULE_RADIUS = 0.35,
  CAPSULE_HEIGHT = 1.3,
  MOTOR_SKIN = 0.01
export function stepSupportedMotor(
  state: TravelerState,
  intent: ControlIntent,
  config: PlayerMotorConfig,
  dt: number,
  collider: SurfaceCollider,
): TravelerState {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) return state
  const position = state.position.clone(),
    radial = position.clone().sub(config.planetCenter).normalize()
  const velocity = state.velocity.clone()
  let up = state.supportUp.clone(),
    forward = state.forward.clone(),
    grounded = state.grounded
  let supportId = state.supportId,
    previousGroundedSupport = state.previousGroundedSupport
  const support = collider.sampleSupport(position, supportId)
  if (grounded && support && Math.abs(support.separation) <= 0.05) {
    forward = transportForward(up, support.normal, forward)
    up.copy(support.normal)
    supportId = support.id
    previousGroundedSupport = support.id
  } else if (grounded) {
    grounded = false
    supportId = "air"
  }
  if (!grounded && !collider.containsFootprint(position)) {
    const nextUp = up.clone(),
      angle = up.angleTo(radial)
    if (angle > 1e-9)
      nextUp.applyAxisAngle(
        up.clone().cross(radial).normalize(),
        Math.min(angle, Math.PI * dt),
      )
    // Sweep the farthest capsule-axis travel before adopting the new up.
    const rotationMove = nextUp
      .clone()
      .sub(up)
      .multiplyScalar(CAPSULE_HEIGHT - CAPSULE_RADIUS)
    if (
      !collider.sweepCamera(
        position.clone().addScaledVector(up, CAPSULE_HEIGHT - CAPSULE_RADIUS),
        position
          .clone()
          .addScaledVector(up, CAPSULE_HEIGHT - CAPSULE_RADIUS)
          .add(rotationMove),
        CAPSULE_RADIUS,
      )
    ) {
      velocity.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(up, nextUp),
      )
      forward = transportForward(up, nextUp, forward)
      up = nextUp
    }
  }
  forward
    .addScaledVector(up, -forward.dot(up))
    .normalize()
    .applyAxisAngle(up, -intent.move.x * config.turnSpeed * dt)
  // Look one fixed displacement ahead to transport onto an adjoining support
  // before the capsule reaches a seam. Geometry and snap remain swept below.
  if (grounded && intent.move.y !== 0) {
    const probe = position
      .clone()
      .addScaledVector(
        forward,
        (intent.run ? config.runSpeed : config.walkSpeed) * intent.move.y * dt,
      )
    const ahead = collider.sampleSupport(probe, supportId)
    if (ahead && ahead.id !== "planet" && Math.abs(ahead.separation) <= 0.05) {
      const top = position
        .clone()
        .addScaledVector(up, CAPSULE_HEIGHT - CAPSULE_RADIUS)
      if (
        !collider.sweepCamera(
          top,
          position
            .clone()
            .addScaledVector(ahead.normal, CAPSULE_HEIGHT - CAPSULE_RADIUS),
          CAPSULE_RADIUS,
        )
      ) {
        const separation = position.clone().sub(ahead.point).dot(ahead.normal)
        if (separation < 0 && separation >= -MOTOR_SKIN) {
          const lift = ahead.normal.clone().multiplyScalar(-separation + 1e-6)
          const block = collider.sweepCapsule(
            position,
            up,
            lift,
            CAPSULE_RADIUS,
            CAPSULE_HEIGHT,
          )
          if (
            !block ||
            block.id === "ramp" ||
            block.id === "floor" ||
            block.id === "landing"
          )
            position.add(lift)
        }
        forward = transportForward(up, ahead.normal, forward)
        up = ahead.normal.clone()
        supportId = ahead.id
      }
    }
  }
  const speed =
    (intent.run ? config.runSpeed : config.walkSpeed) * intent.move.y
  const vertical = grounded ? 0 : velocity.dot(up)
  velocity.copy(forward).multiplyScalar(speed).addScaledVector(up, vertical)
  if (grounded && intent.jumpPressed) {
    velocity.addScaledVector(up, config.jumpSpeed)
    grounded = false
    supportId = "air"
  }
  if (!grounded) velocity.addScaledVector(up, -config.gravity * dt)
  let remaining = velocity.clone().multiplyScalar(dt)
  // Preserve spherical travel exactly while supported on the Planet.
  if (grounded && supportId === "planet") {
    const next = radial
      .clone()
      .applyAxisAngle(
        radial.clone().cross(forward).normalize(),
        (speed * dt) / config.groundRadius,
      )
    remaining = config.planetCenter
      .clone()
      .addScaledVector(next, config.groundRadius)
      .sub(position)
  }
  for (
    let iteration = 0;
    iteration < 4 && remaining.lengthSq() > 1e-16;
    iteration++
  ) {
    const hit = collider.sweepCapsule(
      position,
      up,
      remaining,
      CAPSULE_RADIUS,
      CAPSULE_HEIGHT,
    )
    if (!hit) {
      position.add(remaining)
      remaining.setScalar(0)
      break
    }
    const travel = Math.max(
      0,
      hit.time - MOTOR_SKIN / Math.max(remaining.length(), 1e-9),
    )
    position.addScaledVector(remaining, travel)
    remaining.multiplyScalar(1 - travel)
    const into = remaining.dot(hit.normal)
    if (into < 0) remaining.addScaledVector(hit.normal, -into)
    const speedInto = velocity.dot(hit.normal)
    if (speedInto < 0) velocity.addScaledVector(hit.normal, -speedInto)
    if (hit.time === 0 && into >= -1e-10) break
  }
  const nextSupport = collider.sampleSupport(position, supportId)
  const descending = velocity.dot(up) <= 1e-7 || grounded
  if (
    nextSupport &&
    descending &&
    nextSupport.separation >= -0.05 - 1e-7 &&
    nextSupport.separation <= 0.05
  ) {
    const snap = nextSupport.point.clone().sub(position)
    const obstruction = collider.sweepCapsule(
      position,
      up,
      snap,
      CAPSULE_RADIUS,
      CAPSULE_HEIGHT,
    )
    if (
      !obstruction ||
      obstruction.id === "planet" ||
      obstruction.id === "ramp" ||
      obstruction.id === "floor" ||
      obstruction.id === "landing"
    ) {
      const oldUp = up.clone(),
        nextUp = nextSupport.normal
      const axisStart = position
        .clone()
        .addScaledVector(oldUp, CAPSULE_HEIGHT - CAPSULE_RADIUS)
      const axisEnd = nextSupport.point
        .clone()
        .addScaledVector(nextUp, CAPSULE_HEIGHT - CAPSULE_RADIUS)
      if (!collider.sweepCamera(axisStart, axisEnd, CAPSULE_RADIUS)) {
        position.copy(nextSupport.point)
        forward = transportForward(up, nextUp, forward)
        up = nextUp.clone()
        velocity.addScaledVector(up, -velocity.dot(up))
        grounded = true
        supportId = nextSupport.id
        previousGroundedSupport = nextSupport.id
      }
    }
  } else {
    grounded = false
    supportId = "air"
  }
  return {
    position,
    forward,
    velocity,
    supportUp: up,
    supportId,
    previousGroundedSupport,
    radialVelocity: velocity.dot(
      position.clone().sub(config.planetCenter).normalize(),
    ),
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
