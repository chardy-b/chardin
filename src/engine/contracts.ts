import type * as THREE from "three"

export type ExperienceState =
  | { status: "checking" }
  | { status: "loading"; progress: number }
  | { status: "ready" }
  | { status: "running" }
  | { status: "paused" }
  | { status: "failed"; code: "webgl2" | "runtime" }
  | { status: "disposed" }

export interface TravelerState {
  position: THREE.Vector3
  forward: THREE.Vector3
  radialVelocity: number
  grounded: boolean
  locomotion: "idle" | "walk" | "run" | "airborne"
}

export interface ControlIntent {
  forward: number
  turn: number
  run: boolean
  jumpPressed: boolean
}

export interface SurfaceFrame {
  up: THREE.Vector3
  forward: THREE.Vector3
  right: THREE.Vector3
}

export interface ExperienceRuntime {
  start(): void
  pause(): void
  resume(): void
  dispose(): void
}

export interface Experience {
  start(): boolean
  pause(): void
  resume(): void
  dispose(): void
}
