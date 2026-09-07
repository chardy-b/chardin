import * as THREE from "three"
import { describe, expect, it } from "vitest"

import type { TravelerState } from "@/engine/contracts"
import {
  CAMERA_PITCH_LIMIT,
  CAMERA_YAW_LIMIT,
  applyCameraLook,
  createThirdPersonCameraState,
  updateThirdPersonCamera,
} from "@/engine/camera/third-person-camera"

function traveler(angle: number): TravelerState {
  return {
    position: new THREE.Vector3(
      Math.sin(angle),
      Math.cos(angle),
      0,
    ).multiplyScalar(5.03),
    forward: new THREE.Vector3(Math.cos(angle), -Math.sin(angle), 0),
    radialVelocity: 0,
    grounded: true,
    locomotion: "run",
  }
}

describe("transported third-person camera", () => {
  it("applies bounded device-independent yaw and pitch", () => {
    const actor = traveler(0)
    const initial = createThirdPersonCameraState(actor, new THREE.Vector3())
    const looked = applyCameraLook(initial, { x: 1, y: -1 }, 10)
    const camera = updateThirdPersonCamera(looked, actor, new THREE.Vector3())

    expect(looked.yaw).toBe(CAMERA_YAW_LIMIT)
    expect(looked.pitch).toBe(-CAMERA_PITCH_LIMIT)
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true)
    expect(camera.forward.dot(actor.forward)).toBeLessThan(0.5)
    expect(camera.up.dot(actor.position.clone().normalize())).toBeGreaterThan(
      0.999999,
    )
  })

  it("follows a complete traversal with local up and finite poses", () => {
    let state = createThirdPersonCameraState(traveler(0), new THREE.Vector3())
    state = applyCameraLook(state, { x: 0.4, y: -0.25 }, 1)
    let previousUp = state.up.clone()
    for (let sample = 1; sample <= 720; sample += 1) {
      const actor = traveler((sample / 720) * Math.PI * 2)
      state = updateThirdPersonCamera(state, actor, new THREE.Vector3(), {
        height: 2.25,
        distance: 4.15,
        targetHeight: 0.55,
      })
      const localUp = actor.position.clone().normalize()
      expect(state.position.toArray().every(Number.isFinite)).toBe(true)
      expect(state.target.toArray().every(Number.isFinite)).toBe(true)
      expect(state.up.dot(localUp)).toBeGreaterThan(0.999999)
      expect(state.up.dot(previousUp)).toBeGreaterThan(0.99)
      previousUp = state.up
    }
  })
})
