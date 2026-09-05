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
}

export interface MovementIntent {
  forward: number
  turn: number
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
