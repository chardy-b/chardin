import type { ControlIntent } from "@/engine/contracts"
import type { Quality } from "@/engine/quality/quality-controller"

export interface TestSnapshot {
  presentation: {
    alpha: number
    position: number[]
    cameraPosition: number[]
    cameraTarget: number[]
  }
  animation: { clip: string | null; phase: number; timeScale: number }
  movement: {
    move: { x: number; y: number }
    run: boolean
    signedSpeed: number
  }
  deviceDpr: number
  cameraYaw: number
  cameraPitch: number
  cameraFov: number
  generation: number
  forward: number[]
  supportId: string
  supportUp: number[]
  localFeet: number[]
  cameraPosition: number[]
  cameraTarget: number[]
  cameraMode: string
  travelerVisible: boolean
  landmarkAvailable: boolean
  sky: { tick: number; phase: string; playback: string }
  route: number[][]
  position: number[]
  cameraUp: number[]
  grounded: boolean
  distance: number
  running: boolean
  quality: Quality
  reducedMotion: boolean
  simulationTime: number
  motorRadius: number
  startupContentMs: number
  geometryCount: number
  textureCount: number
  viewport: { width: number; height: number }
}
export interface ChardinTestApi {
  /** Render a bounded interpolation fraction without changing a simulation tick. */
  present(alpha: number): void
  setSkyTick(tick: number): void
  snapshot(): TestSnapshot
  step(frames: number, intent?: Partial<ControlIntent>): void
  /** Sample the real input adapters during fixed steps in manual test mode. */
  stepInput(frames: number): void
  outlineSignals(depth: boolean, normal: boolean): void
}
declare global {
  interface Window {
    __CHARDIN_TEST__?: ChardinTestApi
  }
}

export function installTestApi(api: ChardinTestApi) {
  if (process.env.NEXT_PUBLIC_E2E_HOOKS !== "true") return () => {}
  window.__CHARDIN_TEST__ = Object.freeze(api)
  return () => {
    if (window.__CHARDIN_TEST__ === api) delete window.__CHARDIN_TEST__
  }
}
export function deterministicMode() {
  return (
    process.env.NEXT_PUBLIC_E2E_HOOKS === "true" &&
    new URLSearchParams(window.location.search).get("e2e") === "1"
  )
}
