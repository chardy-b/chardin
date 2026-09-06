import type { InputAdapter, PartialControlIntent } from "@/engine/input/types"

const HANDLED_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "Space",
  "KeyE",
  "Escape",
])

export class KeyboardInput implements InputAdapter {
  private readonly keys = new Set<string>()
  private disposed = false

  constructor(private readonly target: Window) {
    target.addEventListener("keydown", this.onKeyDown)
    target.addEventListener("keyup", this.onKeyUp)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (!HANDLED_CODES.has(event.code)) return
    event.preventDefault()
    this.keys.add(event.code)
  }

  private onKeyUp = (event: KeyboardEvent) => {
    if (!HANDLED_CODES.has(event.code)) return
    event.preventDefault()
    this.keys.delete(event.code)
  }

  sample(): PartialControlIntent {
    if (this.disposed || this.keys.size === 0) return {}
    const x =
      Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
      Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"))
    const y =
      Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) -
      Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"))
    const length = Math.max(1, Math.hypot(x, y))
    return {
      move: { x: x / length, y: y / length },
      run: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      jump: this.keys.has("Space"),
      action: this.keys.has("KeyE"),
      pause: this.keys.has("Escape"),
    }
  }

  clear() {
    this.keys.clear()
  }

  dispose() {
    if (this.disposed) return
    this.clear()
    this.disposed = true
    this.target.removeEventListener("keydown", this.onKeyDown)
    this.target.removeEventListener("keyup", this.onKeyUp)
  }
}
