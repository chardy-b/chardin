import * as THREE from "three"
import { expect, it, vi } from "vitest"
import { createPresentation } from "@/engine/player/presentation"
import {
  createInitialPlayerState,
  stepPlayerMotor,
} from "@/engine/player/player-motor"
import {
  createThirdPersonCameraState,
  updateThirdPersonCamera,
} from "@/engine/camera/third-person-camera"
import { createSkyspaceCollider } from "@/engine/world/skyspace-collider"
import { createSkyspaceStructure } from "@/engine/world/skyspace-landmark"

const config = {
  planetCenter: new THREE.Vector3(),
  groundRadius: 5.03,
  walkSpeed: 1.65,
  runSpeed: 3.3,
  turnSpeed: 1.9,
  jumpSpeed: 4.2,
  gravity: 9.8,
}

it("interpolates a full curved run/turn/jump sequence without altering fixed support or clipping the camera", () => {
  let current = createInitialPlayerState(config)
  let camera = createThirdPersonCameraState(current, config.planetCenter)
  const collider = createSkyspaceCollider(createSkyspaceStructure())
  const presentation = createPresentation()
  const storage = [
    presentation.position,
    presentation.up,
    presentation.forward,
    presentation.rotation,
    presentation.cameraPosition,
  ]
  for (let frame = 0; frame < 300; frame++) {
    const previous = current,
      previousCamera = camera
    current = stepPlayerMotor(
      previous,
      {
        move: { x: 0.25, y: 1 },
        look: { x: 0, y: 0 },
        run: true,
        jumpPressed: frame === 60,
        pausePressed: false,
        actionPressed: false,
      },
      config,
      1 / 60,
      collider,
    )
    camera = updateThirdPersonCamera(camera, current, config.planetCenter, {
      distance: 4.4,
      height: 2.25,
      targetHeight: 0.65,
      collider,
      supportUp: current.supportUp,
      compositionYaw: 0.42,
      shoulder: 0.85,
    })
    const before = JSON.stringify([previous, current, camera])
    const last = previous.position.clone()
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      presentation.traveler(
        previous,
        current,
        alpha,
        config.planetCenter,
        collider,
      )
      presentation.camera(previousCamera, camera, alpha, collider)
      expect(presentation.position.distanceTo(last)).toBeLessThan(0.06)
      expect(presentation.up.dot(presentation.forward)).toBeCloseTo(0, 7)
      expect(presentation.rotation.length()).toBeCloseTo(1, 7)
      if (previous.supportId === "planet" && current.supportId === "planet")
        expect(presentation.position.length()).toBeCloseTo(
          config.groundRadius,
          8,
        )
      expect(
        collider.sweepCamera(
          presentation.cameraPosition,
          presentation.cameraPosition,
          0.12,
        ),
      ).toBeNull()
      expect(JSON.stringify([previous, current, camera])).toBe(before)
      last.copy(presentation.position)
    }
  }
  expect([
    presentation.position,
    presentation.up,
    presentation.forward,
    presentation.rotation,
    presentation.cameraPosition,
  ]).toEqual(storage)
  collider.dispose()
})

it("bounds support projection, malformed alpha and camera mode changes using reusable storage", () => {
  const previous = createInitialPlayerState(config),
    current = createInitialPlayerState(config)
  previous.supportId = current.supportId = "floor"
  current.position.x = 0.03
  const p = createPresentation()
  const support = vi.fn(() => ({
    point: new THREE.Vector3(0, 5, 0),
    normal: new THREE.Vector3(0, 1, 0),
    id: "floor" as const,
    separation: 0.01,
  }))
  const collider = {
    sampleSupport: support,
    sweepCamera: vi.fn(() => null),
    containsFootprint: () => true,
    sweepCapsule: () => null,
  }
  p.traveler(previous, current, 0.5, config.planetCenter, collider)
  expect(p.position.y).toBeCloseTo(5.02)
  support.mockReturnValueOnce({
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
    id: "floor",
    separation: 0.5,
  })
  p.traveler(previous, current, 0.5, config.planetCenter, collider)
  expect(p.position.y).toBeCloseTo(5.03)
  p.traveler(previous, current, Number.NaN, config.planetCenter)
  expect(p.position).toEqual(current.position)
  const before = createThirdPersonCameraState(previous, config.planetCenter)
  const after = {
    ...createThirdPersonCameraState(current, config.planetCenter),
    mode: "view" as const,
  }
  p.camera(before, after, 0)
  expect(p.cameraPosition).toEqual(after.position)
  const blocked = {
    ...collider,
    sweepCamera: vi.fn(() => ({
      time: 0.5,
      normal: new THREE.Vector3(0, 1, 0),
      id: "test",
    })),
  }
  p.camera(before, after, 0.5, blocked)
  expect(p.cameraPosition).toEqual(after.position)
})
