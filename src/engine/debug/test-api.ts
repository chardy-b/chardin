import type { ControlIntent } from "@/engine/contracts"
import type { Quality } from "@/engine/quality/quality-controller"

export interface TestSnapshot {
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
  snapshot(): TestSnapshot
  step(frames: number, intent?: Partial<ControlIntent>): void
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
