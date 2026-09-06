import * as THREE from "three"
import { describe, expect, it } from "vitest"

import {
  createSurfaceFrame,
  transportForward,
} from "@/engine/world/surface-frame"

function expectFrame(position: THREE.Vector3, previousForward: THREE.Vector3) {
  const frame = createSurfaceFrame(
    new THREE.Vector3(),
    position,
    previousForward,
  )
  for (const axis of [frame.up, frame.forward, frame.right]) {
    expect(axis.toArray().every(Number.isFinite)).toBe(true)
    expect(axis.length()).toBeCloseTo(1, 10)
  }
  expect(frame.up.dot(frame.forward)).toBeCloseTo(0, 10)
  expect(frame.up.dot(frame.right)).toBeCloseTo(0, 10)
  expect(frame.forward.dot(frame.right)).toBeCloseTo(0, 10)
  expect(
    frame.right.distanceTo(frame.forward.clone().cross(frame.up)),
  ).toBeLessThan(1e-10)
  return frame
}

describe("surface frame", () => {
  it.each([
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
  ])("is finite and orthonormal at [%i, %i, %i]", (x, y, z) => {
    expectFrame(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, -1))
  })

  it("stays continuous around a full great circle across both poles", () => {
    let previousUp = new THREE.Vector3(1, 0, 0)
    let forward = new THREE.Vector3(0, 1, 0)
    for (let sample = 1; sample <= 720; sample += 1) {
      const angle = (sample / 720) * Math.PI * 2
      const nextUp = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0)
      const nextForward = transportForward(previousUp, nextUp, forward)
      const frame = expectFrame(nextUp, nextForward)
      expect(nextForward.dot(forward)).toBeGreaterThan(0.99)
      previousUp = nextUp
      forward = frame.forward
    }
  })

  it("uses a deterministic finite transport for opposite vectors", () => {
    const a = transportForward(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, -1),
    )
    const b = transportForward(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, -1),
    )
    expect(a.toArray().every(Number.isFinite)).toBe(true)
    expect(a.equals(b)).toBe(true)
    expect(a.dot(new THREE.Vector3(0, -1, 0))).toBeCloseTo(0, 10)
  })
})
