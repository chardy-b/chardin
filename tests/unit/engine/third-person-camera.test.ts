import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"

import type { TravelerState } from "@/engine/contracts"
import {
  type ThirdPersonCameraState,
  CAMERA_PITCH_LIMIT,
  CAMERA_YAW_LIMIT,
  applyCameraLook,
  createThirdPersonCameraState,
  updateThirdPersonCamera,
} from "@/engine/camera/third-person-camera"

function traveler(angle: number): TravelerState {
  return {
    velocity: new THREE.Vector3(),
    supportUp: new THREE.Vector3(0, 1, 0),
    supportId: "planet",
    previousGroundedSupport: "planet",
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

import { createSkyspaceStructure } from "@/engine/world/skyspace-landmark"
import { createSkyspaceCollider } from "@/engine/world/skyspace-collider"
it("shortens both camera sweeps, checks eye fallback, and directly frames the aperture", () => {
  const structure = createSkyspaceStructure(),
    collider = createSkyspaceCollider(structure)
  const actor = {
    ...traveler(0),
    position: structure.toWorld(new THREE.Vector3(0, 0.12, 0.5)),
    supportUp: new THREE.Vector3(0, 1, 0).transformDirection(structure.matrix),
    forward: new THREE.Vector3(0, 0, -1).transformDirection(structure.matrix),
  }
  let camera = createThirdPersonCameraState(actor, new THREE.Vector3())
  camera = updateThirdPersonCamera(camera, actor, new THREE.Vector3(), {
    height: 1.35,
    distance: 0.8,
    targetHeight: 0.85,
    supportUp: actor.supportUp,
    collider,
  })
  expect(
    collider.sweepCamera(camera.position, camera.position, 0.12),
  ).toBeNull()
  const viewed = updateThirdPersonCamera(camera, actor, new THREE.Vector3(), {
    height: 1.35,
    distance: 0.8,
    targetHeight: 0.85,
    supportUp: actor.supportUp,
    collider,
    viewTarget: structure.toWorld(new THREE.Vector3(0, 2.29, -0.15)),
  })
  expect(viewed.mode).toBe("view")
  expect(viewed.hideTraveler).toBe(true)
  expect(structure.toLocal(viewed.position).y).toBeCloseTo(1.37)
  expect(
    viewed.target.distanceTo(
      structure.toWorld(new THREE.Vector3(0, 2.29, -0.15)),
    ),
  ).toBeLessThan(1e-8)
})

it("uses hysteresis for close eye fallback and retains the last safe pose when even the eye is invalid", () => {
  const actor = traveler(0),
    initial = createThirdPersonCameraState(actor, new THREE.Vector3())
  const sweepCamera = vi.fn((from: THREE.Vector3, to: THREE.Vector3) =>
    from.equals(to)
      ? null
      : { time: 0.03, normal: new THREE.Vector3(0, 0, 1), id: "wall" },
  )
  const config = {
    height: 1.35,
    distance: 0.8,
    targetHeight: 0.85,
    collider: { sweepCamera },
  }
  const eye = updateThirdPersonCamera(
    initial,
    actor,
    new THREE.Vector3(),
    config,
  )
  expect(eye.mode).toBe("eye")
  expect(eye.hideTraveler).toBe(true)
  sweepCamera.mockImplementation(() => ({
    time: 0,
    normal: new THREE.Vector3(0, 0, 1),
    id: "wall",
  }))
  const blocked = updateThirdPersonCamera(
    eye,
    actor,
    new THREE.Vector3(),
    config,
  )
  expect(blocked.mode).toBe("blocked")
  expect(blocked.position).toEqual(eye.position)
  sweepCamera.mockImplementation(() => null)
  const free = updateThirdPersonCamera(eye, actor, new THREE.Vector3(), config)
  expect(free.mode).toBe("walking")
  expect(free.hideTraveler).toBe(false)
})
it("sweeps the previous position during fast turns and never passes through the rear wall", () => {
  const structure = createSkyspaceStructure(),
    collider = createSkyspaceCollider(structure)
  const actor = {
    ...traveler(0),
    position: structure.toWorld(new THREE.Vector3(0.8, 0.12, -1)),
    supportUp: new THREE.Vector3(0, 1, 0).transformDirection(structure.matrix),
    forward: new THREE.Vector3(0, 0, 1).transformDirection(structure.matrix),
  }
  let camera = createThirdPersonCameraState(actor, new THREE.Vector3())
  for (let i = 0; i < 100; i++) {
    camera = applyCameraLook(camera, { x: i % 2 ? 1 : -1, y: 1 }, 0.1, 0.35)
    camera = updateThirdPersonCamera(camera, actor, new THREE.Vector3(), {
      height: 1.35,
      distance: 0.8,
      targetHeight: 0.85,
      supportUp: actor.supportUp,
      collider,
    })
    expect(
      collider.sweepCamera(camera.position, camera.position, 0.12),
    ).toBeNull()
  }
})

it("keeps manual yaw relative to the actor without redraw accumulation or face-on turns", () => {
  const actor = traveler(0)
  let camera = createThirdPersonCameraState(actor, new THREE.Vector3())
  camera.yaw = 1e-7
  camera = updateThirdPersonCamera(camera, actor, new THREE.Vector3())
  const pose = camera.position.clone()
  for (let i = 0; i < 60; i++)
    camera = updateThirdPersonCamera(camera, actor, new THREE.Vector3())
  expect(camera.position.distanceTo(pose)).toBeLessThan(1e-12)
  actor.forward.applyAxisAngle(camera.up, Math.PI)
  camera = updateThirdPersonCamera(camera, actor, new THREE.Vector3())
  expect(
    camera.position.clone().sub(actor.position).dot(actor.forward),
  ).toBeLessThan(-4)
  expect(camera.yaw).toBe(1e-7)
})

it("rechecks the final distance after the history sweep and recovers from blocked history", () => {
  const actor = traveler(0)
  const initial = createThirdPersonCameraState(actor, new THREE.Vector3())
  const target = actor.position.clone().addScaledVector(initial.up, 2)
  initial.position = target.clone().addScaledVector(actor.forward, -0.2)
  initial.mode = "walking"
  const sweepCamera = vi.fn((from: THREE.Vector3, to: THREE.Vector3) =>
    !from.equals(to) && from.equals(initial.position)
      ? { time: 0.01, normal: actor.forward.clone(), id: "history-wall" }
      : null,
  )
  const config = {
    height: 2,
    targetHeight: 2,
    distance: 1,
    collider: { sweepCamera },
  }
  const eye = updateThirdPersonCamera(
    initial,
    actor,
    new THREE.Vector3(),
    config,
  )
  expect(eye.mode).toBe("eye")
  expect(eye.hideTraveler).toBe(true)
  const recovered = updateThirdPersonCamera(
    { ...initial, mode: "blocked" },
    actor,
    new THREE.Vector3(),
    config,
  )
  expect(recovered.mode).toBe("walking")
  expect(recovered.hideTraveler).toBe(false)
})

it("rejects avatar intersection and history stranded ahead of movement even with free walls", () => {
  const actor = traveler(0)
  const previous = createThirdPersonCameraState(actor, new THREE.Vector3())
  const config = {
    height: 0.85,
    targetHeight: 0.85,
    distance: 0.45,
    collider: { sweepCamera: () => null },
  }
  expect(
    updateThirdPersonCamera(previous, actor, new THREE.Vector3(), config).mode,
  ).toBe("eye")
  previous.position = actor.position
    .clone()
    .addScaledVector(previous.up, 1.35)
    .add(actor.forward)
  const stranded = updateThirdPersonCamera(
    previous,
    actor,
    new THREE.Vector3(),
    {
      ...config,
      height: 1.35,
      distance: 0.8,
      collider: {
        sweepCamera: (from, to) =>
          !from.equals(to) && from.equals(previous.position)
            ? { time: 0, normal: actor.forward.clone(), id: "history-wall" }
            : null,
      },
    },
  )
  expect(stranded.mode).toBe("eye")
  expect(
    stranded.target.clone().sub(stranded.position).dot(actor.forward),
  ).toBeCloseTo(1)
})

it("uses distinct .40 entry and .50 exit distances without flickering or leaking compact visibility", () => {
  const actor = traveler(0)
  let camera = createThirdPersonCameraState(actor, new THREE.Vector3())
  const config = {
    height: 2,
    targetHeight: 2,
    distance: 0.39,
    collider: { sweepCamera: () => null },
  }
  camera = updateThirdPersonCamera(camera, actor, new THREE.Vector3(), config)
  expect(camera.mode).toBe("eye")
  camera = updateThirdPersonCamera(camera, actor, new THREE.Vector3(), {
    ...config,
    distance: 0.45,
  })
  expect(camera.mode).toBe("eye")
  camera = updateThirdPersonCamera(camera, actor, new THREE.Vector3(), {
    ...config,
    distance: 0.51,
    hideTraveler: true,
  })
  expect(camera.mode).toBe("walking")
  expect(camera.hideTraveler).toBe(true)
  camera = updateThirdPersonCamera(camera, actor, new THREE.Vector3(), {
    ...config,
    distance: 0.45,
  })
  expect(camera.mode).toBe("walking")
  expect(camera.hideTraveler).toBe(false)
})

it("releases visibility by capsule clearance while a safe moving transition remains active", async () => {
  const { cameraIntersectsTraveler, easeCameraTransition } =
    await import("@/engine/camera/third-person-camera")
  const feet = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0)
  const at = (x: number) => new THREE.Vector3(x, 0.85, 0)
  expect(cameraIntersectsTraveler(at(0.48), feet, up)).toBe(true)
  expect(cameraIntersectsTraveler(at(0.54), feet, up)).toBe(false)
  expect(cameraIntersectsTraveler(at(0.54), feet, up, true)).toBe(true)
  expect(cameraIntersectsTraveler(at(0.6), feet, up, true)).toBe(false)
  let state: ThirdPersonCameraState = {
    ...createThirdPersonCameraState(traveler(0), feet),
    position: new THREE.Vector3(0, 1.25, 0),
    target: new THREE.Vector3(0, 1.25, -1),
    mode: "eye" as "eye" | "walking",
    hideTraveler: true,
  }
  const collider = { sweepCamera: vi.fn(() => null) }
  let visible = false
  for (let frame = 0; frame < 60; frame++) {
    feet.z += 1.65 / 60
    const desired = {
      ...state,
      mode: "walking" as const,
      hideTraveler: false,
      position: feet.clone().add(new THREE.Vector3(0, 2.25, 4.4)),
      target: feet.clone().add(new THREE.Vector3(0, 0.65, 0)),
    }
    const next = easeCameraTransition(state, desired, 1 / 60, collider)
    expect(next.position.distanceTo(state.position)).toBeLessThan(0.7)
    visible =
      !next.hideTraveler &&
      !cameraIntersectsTraveler(next.position, feet, up, !visible)
    state = { ...next, mode: "walking", hideTraveler: !!next.hideTraveler }
  }
  expect(state.transitioning).toBe(true)
  expect(visible).toBe(true)
  expect(collider.sweepCamera).toHaveBeenCalled()
})
