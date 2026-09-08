import * as THREE from "three"
import { describe, expect, it } from "vitest"

import {
  LANDMARK_DIRECTION,
  SPAWN_DIRECTION,
  createLandmarkAnchor,
} from "@/engine/world/landmark-anchor"

describe("landmark anchor", () => {
  it("is a stable orthonormal surface frame at nonzero centers", () => {
    const center = new THREE.Vector3(11, -7, 4)
    const first = createLandmarkAnchor(center, 5)
    const repeat = createLandmarkAnchor(center, 5)
    expect(first.position.toArray()).toEqual(repeat.position.toArray())
    expect(first.position.distanceTo(center)).toBeCloseTo(5)
    expect(first.frame.up.dot(first.frame.forward)).toBeCloseTo(0)
    expect(first.frame.up.dot(first.frame.right)).toBeCloseTo(0)
    expect(first.frame.forward.dot(first.frame.right)).toBeCloseTo(0)
    expect(first.frame.up.length()).toBeCloseTo(1)
    expect(first.frame.forward.length()).toBeCloseTo(1)
    expect(first.frame.right.length()).toBeCloseTo(1)
    expect(
      first.frame.up.clone().cross(first.frame.right).dot(first.frame.forward),
    ).toBeCloseTo(1)
  })

  it("stays separate from the authored spawn clearing", () => {
    expect(LANDMARK_DIRECTION.angleTo(SPAWN_DIRECTION)).toBeGreaterThan(0.8)
  })
})
