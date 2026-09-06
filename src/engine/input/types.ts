import type { ControlIntent } from "@/engine/contracts"

export interface PartialControlIntent {
  move?: ControlIntent["move"]
  look?: ControlIntent["look"]
  run?: boolean
  jump?: boolean
  action?: boolean
  pause?: boolean
}

export interface InputAdapter {
  sample(): PartialControlIntent
  clear(): void
  dispose(): void
}
