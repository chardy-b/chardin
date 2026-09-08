import * as THREE from "three"
import { expect, it } from "vitest"
import {
  createSkyController,
  lightFrameAt,
} from "@/engine/world/sky-controller"
it("uses linear smoothstep colors and constant lighting at boundaries and midpoints", () => {
  expect(lightFrameAt(0).sky).toEqual(new THREE.Color("#BFCFD1").toArray())
  expect(lightFrameAt(3150).wall).toEqual(
    new THREE.Color("#ADA89C").lerp(new THREE.Color("#BEA58C"), 0.5).toArray(),
  )
  expect(lightFrameAt(10800)).toEqual({ ...lightFrameAt(0), phase: "Return" })
  for (let tick = 0; tick <= 10800; tick += 15) {
    const frame = lightFrameAt(tick)
    expect(frame.exposure).toBe(1.05)
    expect(frame.sunIntensity).toBe(2.4)
    expect([...frame.sky, ...frame.wall].every(Number.isFinite)).toBe(true)
  }
  for (const tick of [-1, 1.5, NaN, 10801])
    expect(() => lightFrameAt(tick)).toThrow()
})
it("starts explicitly, freezes on exit, reentry and preference changes require Continue", () => {
  const sky = createSkyController(false)
  sky.step(true, true)
  expect(sky.snapshot().tick).toBe(0)
  sky.command("start", true)
  for (let i = 0; i < 50; i++) sky.step(true, true)
  expect(sky.snapshot().tick).toBe(50)
  sky.step(true, false)
  sky.step(true, true)
  expect(sky.snapshot().tick).toBe(50)
  sky.command("continue", true)
  sky.step(false, true)
  expect(sky.snapshot().tick).toBe(50)
  sky.setReducedMotion(true)
  sky.step(true, true)
  expect(sky.snapshot().tick).toBe(50)
  sky.setReducedMotion(false)
  sky.step(true, true)
  expect(sky.snapshot().tick).toBe(50)
  sky.command("next-still", true)
  expect(sky.snapshot().tick).toBe(1800)
  sky.command("previous-still", true)
  expect(sky.snapshot().tick).toBe(1800)
  sky.setTick(10799)
  sky.command("continue", true)
  sky.step(true, true)
  expect(sky.snapshot().playback).toBe("complete")
  sky.step(true, true)
  expect(sky.snapshot().tick).toBe(10800)
  sky.command("start", true)
  expect(sky.snapshot().tick).toBe(0)
})

import { chamberOccupancy, inViewingZone } from "@/engine/world/sky-controller"
it("retains threshold hysteresis and jump occupancy without admitting exterior feet", () => {
  expect(chamberOccupancy(new THREE.Vector3(0, 0.12, 1.39), false)).toBe(false)
  expect(chamberOccupancy(new THREE.Vector3(0, 0.12, 1.34), false)).toBe(true)
  expect(chamberOccupancy(new THREE.Vector3(0, 1, 1.44), true)).toBe(true)
  expect(chamberOccupancy(new THREE.Vector3(0, 0.12, 1.46), true)).toBe(false)
  expect(chamberOccupancy(new THREE.Vector3(0, 2.4, 0), true)).toBe(false)
  expect(inViewingZone(new THREE.Vector3(0, 0.12, 0.5), false)).toBe(false)
})
it("holds safe neutral on invalid score data and handles every explicit still command", () => {
  const invalid = createSkyController(false, false)
  invalid.command("start", true)
  invalid.setTick(4500)
  invalid.step(true, true)
  expect(invalid.snapshot()).toMatchObject({
    tick: 0,
    playback: "still",
    scoreAvailable: false,
  })
  const sky = createSkyController(true)
  sky.command("start", true)
  sky.step(true, true)
  expect(sky.snapshot().tick).toBe(0)
  sky.command("next-still", false)
  sky.command("next-still", false)
  expect(sky.snapshot().tick).toBe(4500)
  sky.command("previous-still", false)
  expect(sky.snapshot().tick).toBe(1800)
  sky.setTick(10800)
  sky.command("next-still", true)
  expect(sky.snapshot().tick).toBe(10800)
  sky.setReducedMotion(false)
  sky.command("freeze", true)
  sky.command("still", true)
  expect(sky.snapshot().playback).toBe("still")
  sky.reset()
  expect(sky.snapshot()).toMatchObject({ tick: 0, playback: "ready" })
})
it("has zero endpoint slope and identical fixed-tick results across render groupings", () => {
  for (const tick of [1800, 4500, 6300, 8100]) {
    const before = lightFrameAt(tick - 1),
      at = lightFrameAt(tick),
      after = lightFrameAt(tick + 1)
    for (const token of ["sky", "wall"] as const)
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(at[token][i]! - before[token][i]!)).toBeLessThan(1e-6)
        expect(Math.abs(after[token][i]! - at[token][i]!)).toBeLessThan(1e-6)
      }
  }
  const a = createSkyController(false),
    b = createSkyController(false)
  a.command("start", true)
  b.command("start", true)
  for (let i = 0; i < 10800; i++) a.step(true, true)
  for (let i = 0; i < 1800; i++) for (let j = 0; j < 6; j++) b.step(true, true)
  expect(a.snapshot()).toEqual(b.snapshot())
  expect(a.frame()).toEqual(b.frame())
})
