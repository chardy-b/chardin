import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"

import type { ControlIntent, TravelerState } from "@/engine/contracts"
import {
  createInitialPlayerState,
  stepPlayerMotor,
  type PlayerMotorConfig,
} from "@/engine/player/player-motor"

const config: PlayerMotorConfig = {
  planetCenter: new THREE.Vector3(),
  groundRadius: 5.03,
  walkSpeed: 1.65,
  runSpeed: 3.3,
  turnSpeed: 1.9,
  jumpSpeed: 4.2,
  gravity: 9.8,
}

const idle: ControlIntent = {
  move: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  run: false,
  jumpPressed: false,
  actionPressed: false,
  pausePressed: false,
}

function stepFor(
  state: TravelerState,
  intent: ControlIntent,
  seconds: number,
  hz = 60,
) {
  for (let step = 0; step < seconds * hz; step += 1) {
    state = stepPlayerMotor(state, intent, config, 1 / hz)
  }
  return state
}

describe("spherical player motor", () => {
  it("keeps idle state grounded and finite", () => {
    const initial = createInitialPlayerState(config)
    const next = stepFor(initial, idle, 1)
    expect(next.position.distanceTo(config.planetCenter)).toBeCloseTo(5.03)
    expect(next.grounded).toBe(true)
    expect(next.locomotion).toBe("idle")
    expect(next.forward.toArray().every(Number.isFinite)).toBe(true)
  })

  it("walks forward, turns, and runs faster on the surface", () => {
    const initial = createInitialPlayerState(config)
    const walked = stepFor(initial, { ...idle, move: { x: 0, y: 1 } }, 1)
    const ran = stepFor(
      initial,
      { ...idle, move: { x: 0, y: 1 }, run: true },
      1,
    )
    const turned = stepFor(initial, { ...idle, move: { x: 1, y: 0 } }, 0.5)

    expect(
      walked.position.clone().sub(initial.position).dot(initial.forward),
    ).toBeGreaterThan(0)
    expect(initial.position.angleTo(ran.position)).toBeGreaterThan(
      initial.position.angleTo(walked.position),
    )
    expect(walked.locomotion).toBe("walk")
    expect(ran.locomotion).toBe("run")
    expect(turned.forward.dot(initial.forward)).toBeLessThan(0.9)
  })

  it("produces the same fixed-step result under different render grouping", () => {
    const initial = createInitialPlayerState(config)
    const a = stepFor(initial, { ...idle, move: { x: 0.35, y: 1 } }, 2)
    let b = initial
    for (let frame = 0; frame < 60; frame += 1) {
      b = stepPlayerMotor(
        b,
        { ...idle, move: { x: 0.35, y: 1 } },
        config,
        1 / 60,
      )
      b = stepPlayerMotor(
        b,
        { ...idle, move: { x: 0.35, y: 1 } },
        config,
        1 / 60,
      )
    }
    expect(a.position.distanceTo(b.position)).toBeLessThan(1e-10)
    expect(a.forward.distanceTo(b.forward)).toBeLessThan(1e-10)
  })

  it("jumps radially and lands back on the planet", () => {
    let state = stepPlayerMotor(
      createInitialPlayerState(config),
      { ...idle, jumpPressed: true },
      config,
      1 / 60,
    )
    expect(state.grounded).toBe(false)
    expect(state.radialVelocity).toBeGreaterThan(0)
    let peak = state.position.length()
    for (let step = 0; step < 180; step += 1) {
      state = stepPlayerMotor(state, idle, config, 1 / 60)
      peak = Math.max(peak, state.position.length())
    }
    expect(peak).toBeGreaterThan(config.groundRadius + 0.5)
    expect(state.grounded).toBe(true)
    expect(state.radialVelocity).toBe(0)
    expect(state.position.length()).toBeCloseTo(config.groundRadius, 10)
  })

  it("crosses both poles without discontinuity or inversion", () => {
    let state = createInitialPlayerState(config)
    let previousForward = state.forward.clone()
    let crossedNorth = false
    let crossedSouth = false
    for (let step = 0; step < 700; step += 1) {
      state = stepPlayerMotor(
        state,
        { ...idle, move: { x: 0, y: 1 }, run: true },
        config,
        1 / 60,
      )
      crossedSouth ||= state.position.y < -config.groundRadius * 0.999
      crossedNorth ||=
        crossedSouth && state.position.y > config.groundRadius * 0.999
      expect(state.position.toArray().every(Number.isFinite)).toBe(true)
      expect(state.forward.toArray().every(Number.isFinite)).toBe(true)
      expect(state.forward.dot(previousForward)).toBeGreaterThan(0.99)
      previousForward = state.forward
    }
    expect(crossedNorth).toBe(true)
    expect(crossedSouth).toBe(true)
  })
})

import {
  createSkyspaceStructure,
  sphereHeight,
  rampHeight,
} from "@/engine/world/skyspace-landmark"
import { createSkyspaceCollider } from "@/engine/world/skyspace-collider"
import { createSurfaceFrame } from "@/engine/world/surface-frame"
it("walks and runs ten continuous ramp/chamber/return trips with real collision queries", () => {
  const structure = createSkyspaceStructure(),
    collider = createSkyspaceCollider(structure)
  for (const run of [false, true])
    for (let trip = 0; trip < 10; trip++) {
      const position = structure.toWorld(
        new THREE.Vector3(0, sphereHeight(0, 3.65), 3.65),
      )
      const inward = new THREE.Vector3(0, 0, -1).transformDirection(
        structure.matrix,
      )
      const frame = createSurfaceFrame(config.planetCenter, position, inward)
      let state: TravelerState = {
        ...createInitialPlayerState(config),
        position,
        forward: frame.forward,
        supportUp: frame.up,
      }
      for (
        let i = 0;
        i < 600 && structure.toLocal(state.position).z > 0.5;
        i++
      ) {
        state = stepPlayerMotor(
          state,
          { ...idle, run, move: { x: 0, y: 1 } },
          config,
          1 / 60,
          collider,
        )
        const overlap = collider.sweepCapsule(
          state.position,
          state.supportUp,
          new THREE.Vector3(),
          0.35,
          1.3,
        )
        expect(overlap?.penetration ?? 0).toBeLessThanOrEqual(0.01001)
      }
      let local = structure.toLocal(state.position)
      expect(local.z).toBeLessThanOrEqual(0.55)
      expect(local.y).toBeCloseTo(0.12, 2)
      expect(state.supportId).toBe("floor")
      for (
        let i = 0;
        i < 600 && structure.toLocal(state.position).z < 3.65;
        i++
      )
        state = stepPlayerMotor(
          state,
          { ...idle, run, move: { x: 0, y: -1 } },
          config,
          1 / 60,
          collider,
        )
      local = structure.toLocal(state.position)
      expect(local.z).toBeGreaterThanOrEqual(3.65)
      expect(state.supportId).toBe("planet")
    }
})
it("slides at corners and resolves ceiling velocity before landing architecturally upright", () => {
  const structure = createSkyspaceStructure(),
    collider = createSkyspaceCollider(structure)
  let state: TravelerState = {
    ...createInitialPlayerState(config),
    position: structure.toWorld(new THREE.Vector3(0.8, 0.12, 0)),
    forward: new THREE.Vector3(0, 0, -1).transformDirection(structure.matrix),
    supportUp: new THREE.Vector3(0, 1, 0).transformDirection(structure.matrix),
    supportId: "floor",
  }
  let peak = 0
  for (let i = 0; i < 180; i++) {
    state = stepPlayerMotor(
      state,
      { ...idle, jumpPressed: i === 0, move: { x: 0, y: 1 }, run: true },
      config,
      1 / 60,
      collider,
    )
    const p = structure.toLocal(state.position)
    peak = Math.max(peak, p.y)
    expect(p.z).toBeGreaterThanOrEqual(-1.06)
    expect(p.y).toBeLessThanOrEqual(0.94)
  }
  expect(peak).toBeGreaterThan(0.5)
  expect(state.grounded).toBe(true)
  expect(state.supportId).toBe("floor")
})
it("allows a ramp-side jump to fall back to radial ground and bounds airborne up changes", () => {
  const structure = createSkyspaceStructure(),
    collider = createSkyspaceCollider(structure)
  const p = structure.toWorld(new THREE.Vector3(0.4, rampHeight(0.4, 2), 2)),
    contact = collider.sampleSupport(p, "ramp")!
  let state: TravelerState = {
    ...createInitialPlayerState(config),
    position: contact.point,
    forward: new THREE.Vector3(1, 0, 0).transformDirection(structure.matrix),
    supportUp: contact.normal,
    supportId: "ramp",
    previousGroundedSupport: "ramp",
  }
  let left = false
  for (let i = 0; i < 240; i++) {
    const previous = state.supportUp.clone()
    state = stepPlayerMotor(
      state,
      {
        ...idle,
        jumpPressed: i === 0,
        move: { x: 0, y: i < 80 ? 1 : 0 },
        run: true,
      },
      config,
      1 / 60,
      collider,
    )
    left ||= !collider.containsFootprint(state.position)
    if (!state.grounded)
      expect(previous.angleTo(state.supportUp)).toBeLessThanOrEqual(
        Math.PI / 60 + 1e-7,
      )
    expect(state.position.toArray().every(Number.isFinite)).toBe(true)
  }
  expect(left).toBe(true)
  expect(state.supportId).toBe("planet")
  expect(state.grounded).toBe(true)
  expect(state.position.length()).toBeCloseTo(5.03, 5)
})
it("stops residual movement after four slide iterations and rejects an invalid timestep", () => {
  const state = createInitialPlayerState(config)
  const sweepCapsule = vi.fn(() => ({
    time: 0,
    normal: new THREE.Vector3(0, 1, 0),
    id: "ceiling",
  }))
  const collider = {
    sampleSupport: () => null,
    sweepCapsule,
    sweepCamera: () => null,
    containsFootprint: () => true,
  }
  const result = stepPlayerMotor(
    state,
    { ...idle, move: { x: 0, y: 1 } },
    config,
    0.1,
    collider,
  )
  expect(sweepCapsule.mock.calls.length).toBeLessThanOrEqual(4)
  expect(result.position).toEqual(state.position)
  expect(stepPlayerMotor(state, idle, config, NaN, collider)).toBe(state)
})
