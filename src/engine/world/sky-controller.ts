import * as THREE from "three"

export type SkyCommand =
  | "start"
  | "continue"
  | "freeze"
  | "still"
  | "previous-still"
  | "next-still"
  | "view"
  | "leave-view"
  | "return-to-clearing"
export const SKY_COMMANDS: readonly SkyCommand[] = [
  "start",
  "continue",
  "freeze",
  "still",
  "previous-still",
  "next-still",
  "view",
  "leave-view",
  "return-to-clearing",
]
export const STILL_TICKS = [1800, 4500, 6300, 8100, 10800] as const
export type SkyPlayback = "ready" | "playing" | "paused" | "still" | "complete"
export interface SkyStatus {
  phase: string
  playback: SkyPlayback
  inside: boolean
  viewingZone: boolean
  viewing: boolean
  available: boolean
  scoreAvailable: boolean
  reducedMotion: boolean
}
const neutralSky = new THREE.Color("#BFCFD1")
const blueSky = new THREE.Color("#ADC5D3")
const neutralWall = new THREE.Color("#ADA89C")
const warmWall = new THREE.Color("#BEA58C")
const coolWall = new THREE.Color("#9FADA9")
const sunColor = new THREE.Color("#FFEFC1").toArray()
const sunDirection = new THREE.Vector3(-5, 9, 7).normalize().toArray()
function validTick(tick: number) {
  if (!Number.isInteger(tick) || tick < 0 || tick > 10800)
    throw new Error("Invalid sky tick")
}
export function lightFrameAt(tick: number) {
  validTick(tick)
  const sky = neutralSky.clone(),
    wall = neutralWall.clone()
  let phase = "Settle"
  const fraction = (start: number, end: number) =>
    THREE.MathUtils.smoothstep(tick, start, end)
  if (tick > 8100) {
    phase = "Return"
    sky.copy(blueSky).lerp(neutralSky, fraction(8100, 10800))
    wall.copy(coolWall).lerp(neutralWall, fraction(8100, 10800))
  } else if (tick > 6300) {
    phase = "Cool surround"
    sky.copy(blueSky)
    wall.copy(warmWall).lerp(coolWall, fraction(6300, 8100))
  } else if (tick > 4500) {
    phase = "Open blue"
    sky.lerp(blueSky, fraction(4500, 6300))
    wall.copy(warmWall)
  } else if (tick > 1800) {
    phase = "Warm surround"
    wall.lerp(warmWall, fraction(1800, 4500))
  }
  return {
    sky: sky.toArray(),
    wall: wall.toArray(),
    phase,
    exposure: 1.05,
    sunIntensity: 2.4,
    sunColor: [...sunColor],
    sunDirection: [...sunDirection],
  }
}
export type LightFrame = ReturnType<typeof lightFrameAt>

export function createSkyController(
  initialReducedMotion: boolean,
  validScore = true,
) {
  let tick = 0,
    reducedMotion = initialReducedMotion
  let playback: SkyPlayback = reducedMotion || !validScore ? "still" : "ready"
  return {
    snapshot: () => ({
      tick,
      phase: lightFrameAt(tick).phase,
      playback,
      reducedMotion,
      scoreAvailable: validScore,
    }),
    frame: () => lightFrameAt(tick),
    setTick(next: number) {
      validTick(next)
      if (!validScore) return
      tick = next
      playback = tick === 10800 ? "complete" : "paused"
    },
    setReducedMotion(next: boolean) {
      if (next === reducedMotion) return
      reducedMotion = next
      if (playback !== "complete") playback = next ? "still" : "paused"
    },
    reset() {
      tick = 0
      playback = reducedMotion || !validScore ? "still" : "ready"
    },
    command(command: SkyCommand, inside: boolean) {
      if (!validScore) return
      if (command === "freeze") playback = "paused"
      if (command === "still") playback = "still"
      if (command === "previous-still" || command === "next-still") {
        const next =
          command === "next-still"
            ? (STILL_TICKS.find((t) => t > tick) ?? 10800)
            : ([...STILL_TICKS].reverse().find((t) => t < tick) ?? 1800)
        tick = next
        playback = "still"
      }
      if (!inside || reducedMotion) return
      if (command === "start") {
        tick = 0
        playback = "playing"
      }
      if (command === "continue" && tick < 10800) playback = "playing"
    },
    step(running: boolean, inside: boolean) {
      if (!inside && playback === "playing") playback = "paused"
      if (running && inside && !reducedMotion && playback === "playing") {
        tick++
        if (tick === 10800) playback = "complete"
      }
    },
  }
}

/** Hysteresis is spatial and retains occupancy during a jump beneath the roof. */
export function chamberOccupancy(feet: THREE.Vector3, previous: boolean) {
  const margin = previous ? 0.05 : -0.05
  return (
    Math.abs(feet.x) <= 1.2 + margin &&
    Math.abs(feet.z) <= 1.4 + margin &&
    feet.y >= 0.1 &&
    feet.y <= 2.23
  )
}
export function inViewingZone(feet: THREE.Vector3, grounded: boolean) {
  return (
    grounded &&
    Math.abs(feet.x) <= 0.25 &&
    feet.z >= 0.3 &&
    feet.z <= 0.7 &&
    Math.abs(feet.y - 0.12) <= 0.025
  )
}
