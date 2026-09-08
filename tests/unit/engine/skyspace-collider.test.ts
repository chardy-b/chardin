import * as THREE from "three"
import { expect, it } from "vitest"
import {
  createSkyspaceStructure,
  rampHeight,
} from "@/engine/world/skyspace-landmark"
import { createSkyspaceCollider } from "@/engine/world/skyspace-collider"
const structure = createSkyspaceStructure()
const collider = createSkyspaceCollider(structure)
const world = (x: number, y: number, z: number) =>
  structure.toWorld(new THREE.Vector3(x, y, z))
const up = new THREE.Vector3(0, 1, 0).transformDirection(structure.matrix)
it("samples stable floor/ramp/planet support in world coordinates", () => {
  const floor = collider.sampleSupport(world(0, 0.12, 0.5), "floor")!
  expect(floor.id).toBe("floor")
  expect(floor.separation).toBeCloseTo(0)
  expect(floor.normal.distanceTo(up)).toBeLessThan(1e-10)
  expect(
    collider.sampleSupport(world(0, rampHeight(0, 2.5), 2.5), "ramp")!.id,
  ).toBe("ramp")
  expect(
    collider.sampleSupport(new THREE.Vector3(0, 5.03, 0), "planet")!.id,
  ).toBe("planet")
  floor.normal.set(0, 0, 0)
  expect(
    collider.sampleSupport(world(0, 0.12, 0.5), "floor")!.normal.length(),
  ).toBeCloseTo(1)
})
it("sweeps a complete capsule against walls, doorway jamb and ceiling without sealing the opening", () => {
  const displacement = world(0, 0.12, -4).sub(world(0, 0.12, 0.5))
  const hit = collider.sweepCapsule(
    world(0, 0.12, 0.5),
    up,
    displacement,
    0.35,
    1.3,
  )!
  expect(hit.id).toBe("wall-back")
  expect(hit.time).toBeGreaterThan(0)
  expect(hit.time).toBeLessThan(1)
  expect(
    collider.sweepCapsule(
      world(0, 0.12, 1.6),
      up,
      world(0, 0.12, 0.8).sub(world(0, 0.12, 1.6)),
      0.35,
      1.3,
    ),
  ).toBeNull()
  expect(
    collider.sweepCapsule(
      world(0.5, 0.12, 1.9),
      up,
      up
        .clone()
        .cross(new THREE.Vector3(1, 0, 0))
        .multiplyScalar(0),
      0.35,
      1.3,
    ),
  ).not.toBeUndefined()
  expect(
    collider.sweepCapsule(
      world(0.8, 0.12, 0),
      up,
      up.clone().multiplyScalar(2),
      0.35,
      1.3,
    )!.id,
  ).toBe("ceiling")
})
it("camera sweeps are two-sided and include planet and the open aperture", () => {
  expect(
    collider.sweepCamera(world(0, 1.3, 0), world(4, 1.3, 0), 0.12)!.id,
  ).toBe("wall-right")
  expect(
    collider.sweepCamera(world(4, 1.3, 0), world(0, 1.3, 0), 0.12)!.id,
  ).toBe("wall-right")
  expect(
    collider.sweepCamera(world(0, 1.37, 0), world(0, 4, 0), 0.12),
  ).toBeNull()
  expect(
    collider.sweepCamera(
      new THREE.Vector3(0, 7, 0),
      new THREE.Vector3(0, 0, 0),
      0.12,
    )!.id,
  ).toBe("planet")
  expect(() =>
    collider.sweepCamera(new THREE.Vector3(NaN, 0, 0), world(0, 0, 0), 0.12),
  ).toThrow()
})

it("rejects invalid shapes and releases its collider storage", () => {
  const local = createSkyspaceCollider(createSkyspaceStructure())
  for (const [r, h] of [
    [0, 1],
    [-1, 2],
    [3, 6],
    [0.35, 0.3],
    [NaN, 1.3],
    [0.35, Infinity],
  ])
    expect(() =>
      local.sweepCapsule(world(0, 0.12, 0), up, new THREE.Vector3(), r!, h!),
    ).toThrow()
  expect(() =>
    local.sweepCapsule(
      world(0, 0.12, 0),
      new THREE.Vector3(),
      new THREE.Vector3(),
      0.35,
      1.3,
    ),
  ).toThrow()
  expect(local.containsFootprint(world(0, 0.12, 0))).toBe(true)
  expect(local.containsFootprint(world(0, 5, 0))).toBe(false)
  expect(local.nearLandmark!(world(0, 0.12, 0))).toBe(true)
  local.dispose()
  local.dispose()
  expect(local.sampleSupport(world(0, 0.12, 0), "floor")).toBeNull()
  expect(local.sweepCamera(world(0, 1, 0), world(4, 1, 0), 0.12)).toBeNull()
})
it("blocks jambs, skirt and below-floor entry and detects an overlapping camera", () => {
  expect(
    collider.sweepCamera(world(0, -0.2, 0), world(0, 0.4, 0), 0.12)!.id,
  ).toBe("floor")
  expect(
    collider.sweepCapsule(
      world(1.8, -0.1, 0),
      up,
      world(0, -0.1, 0).sub(world(1.8, -0.1, 0)),
      0.35,
      1.3,
    ),
  ).not.toBeNull()
  expect(
    collider.sweepCapsule(
      world(0.5, 0.12, 2.1),
      up,
      world(0.5, 0.12, 0.8).sub(world(0.5, 0.12, 2.1)),
      0.35,
      1.3,
    )!.id,
  ).toBe("door-right")
  expect(
    collider.sweepCamera(world(1.25, 1, 0), world(1.25, 1, 0), 0.12),
  ).not.toBeNull()
})
