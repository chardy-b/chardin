import type * as THREE from "three"
import type { Quality } from "@/engine/quality/quality-controller"

export type ExperienceState =
  | { status: "checking" }
  | { status: "loading"; progress: number }
  | { status: "ready" }
  | { status: "running" }
  | { status: "paused" }
  | { status: "context-lost" }
  | { status: "recovered" }
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
  move: { x: number; y: number }
  look: { x: number; y: number }
  run: boolean
  jumpPressed: boolean
  actionPressed: boolean
  pausePressed: boolean
}

export interface SurfaceFrame {
  up: THREE.Vector3
  forward: THREE.Vector3
  right: THREE.Vector3
}

export interface RuntimeOptions {
  touchRoot?: HTMLElement | null
  onPauseRequested?: () => void
  onFatal?: () => void
  onQuality?: (quality: Quality) => void
  quality?: Quality
}

export interface ExperienceRuntime {
  ready?: Promise<void>
  setQuality?(quality: Quality): void
  start(): void
  pause(): void
  resume(): void
  dispose(): void
}

export interface Experience {
  retry(): void
  setQuality(quality: Quality): void
  start(): boolean
  pause(): void
  resume(): void
  dispose(): void
}
