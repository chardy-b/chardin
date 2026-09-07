import type { ControlIntent } from "@/engine/contracts"
import type { InputAdapter, PartialControlIntent } from "@/engine/input/types"

const EMPTY_INTENT: ControlIntent = {
  move: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  run: false,
  jumpPressed: false,
  actionPressed: false,
  pausePressed: false,
}

function clampVector(vector = { x: 0, y: 0 }) {
  const x = Number.isFinite(vector.x) ? vector.x : 0
  const y = Number.isFinite(vector.y) ? vector.y : 0
  const length = Math.hypot(x, y)
  if (length <= 1) return { x, y }
  return { x: x / length, y: y / length }
}

function strongest(states: PartialControlIntent[], key: "move" | "look") {
  let result = { x: 0, y: 0 }
  let magnitude = 0
  for (const state of states) {
    const candidate = clampVector(state[key])
    const candidateMagnitude = Math.hypot(candidate.x, candidate.y)
    if (candidateMagnitude > magnitude) {
      result = candidate
      magnitude = candidateMagnitude
    }
  }
  return result
}

export class InputManager {
  private held = { jump: false, action: false, pause: false }
  private disposed = false

  constructor(private readonly adapters: InputAdapter[]) {
    window.addEventListener("blur", this.clear)
    document.addEventListener("visibilitychange", this.onVisibilityChange)
  }

  private onVisibilityChange = () => {
    if (document.hidden) this.clear()
  }

  clear = () => {
    for (const adapter of this.adapters) adapter.clear()
    this.held = { jump: false, action: false, pause: false }
  }

  pause() {
    this.clear()
  }

  sample(): ControlIntent {
    if (this.disposed)
      return { ...EMPTY_INTENT, move: { x: 0, y: 0 }, look: { x: 0, y: 0 } }
    const states = this.adapters.map((adapter) => adapter.sample())
    const jump = states.some((state) => state.jump)
    const action = states.some((state) => state.action)
    const pause = states.some((state) => state.pause)
    const intent: ControlIntent = {
      move: strongest(states, "move"),
      look: strongest(states, "look"),
      run: states.some((state) => state.run),
      jumpPressed: jump && !this.held.jump,
      actionPressed: action && !this.held.action,
      pausePressed: pause && !this.held.pause,
    }
    this.held = { jump, action, pause }
    return intent
  }

  dispose() {
    if (this.disposed) return
    this.clear()
    this.disposed = true
    window.removeEventListener("blur", this.clear)
    document.removeEventListener("visibilitychange", this.onVisibilityChange)
    for (const adapter of this.adapters) adapter.dispose()
  }
}
