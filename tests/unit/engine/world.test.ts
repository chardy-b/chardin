import * as THREE from "three"
import { describe, expect, it } from "vitest"

import {
  createInitialTravelerState,
  stepTraveler,
} from "@/engine/world/traveler-motion"

describe("traveler motion", () => {
  it("moves along the planet while remaining on its surface", () => {
    const initial = createInitialTravelerState(5)
    const movedForward = stepTraveler(initial, { forward: 1, turn: 0 }, 1, 5)
    const movedBackward = stepTraveler(initial, { forward: -1, turn: 0 }, 1, 5)

    expect(movedForward.position.distanceTo(new THREE.Vector3())).toBeCloseTo(5)
    expect(movedForward.position.distanceTo(initial.position)).toBeGreaterThan(
      0.5,
    )
    expect(
      movedForward.position.clone().sub(initial.position).dot(initial.forward),
    ).toBeGreaterThan(0)
    expect(
      movedBackward.position.clone().sub(initial.position).dot(initial.forward),
    ).toBeLessThan(0)
  })

  it("turns before moving and remains finite", () => {
    let state = createInitialTravelerState(5)
    state = stepTraveler(state, { forward: 0, turn: 1 }, 0.5, 5)
    state = stepTraveler(state, { forward: 1, turn: 0 }, 0.5, 5)

    expect(state.position.toArray().every(Number.isFinite)).toBe(true)
    expect(state.forward.toArray().every(Number.isFinite)).toBe(true)
    expect(state.position.length()).toBeCloseTo(5)
  })
})
