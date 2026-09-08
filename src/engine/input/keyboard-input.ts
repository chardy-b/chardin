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
  "KeyI",
  "KeyJ",
  "KeyK",
  "KeyL",
])

const EDGE_CODES = new Set(["Space", "KeyE", "Escape"])

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "button, a, input, textarea, select, summary, [role='button'], [contenteditable]:not([contenteditable='false'])",
      ),
    )
  )
}

export class KeyboardInput implements InputAdapter {
  private readonly keys = new Set<string>()
  private readonly pressedEdges = new Set<string>()
  private readonly suppressedEdgesUntilKeyUp = new Set<string>()
  private disposed = false

  constructor(private readonly target: Window) {
    target.addEventListener("keydown", this.onKeyDown)
    target.addEventListener("keyup", this.onKeyUp)
    target.addEventListener("focusin", this.onFocusIn)
  }

  private onFocusIn = (event: FocusEvent) => {
    // Relinquish held keys and queued edges when focus moves into native UI.
    if (isInteractiveTarget(event.target)) this.clear()
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (!HANDLED_CODES.has(event.code)) return
    if (
      isInteractiveTarget(event.target) ||
      this.target.document.querySelector(
        "dialog[open], [role=dialog][aria-modal=true]",
      )
    )
      return
    event.preventDefault()
    // A held key may have started on a control/modal that owns its keydown.
    // Repeats after focus returns must never manufacture a gameplay edge.
    if (
      event.repeat &&
      EDGE_CODES.has(event.code) &&
      !this.keys.has(event.code)
    )
      return
    if (this.suppressedEdgesUntilKeyUp.has(event.code)) {
      if (event.repeat) return
      this.suppressedEdgesUntilKeyUp.delete(event.code)
    }
    if (!event.repeat && EDGE_CODES.has(event.code))
      this.pressedEdges.add(event.code)
    this.keys.add(event.code)
  }

  private onKeyUp = (event: KeyboardEvent) => {
    if (!HANDLED_CODES.has(event.code)) return
    if (isInteractiveTarget(event.target)) {
      this.keys.delete(event.code)
      this.pressedEdges.delete(event.code)
      this.suppressedEdgesUntilKeyUp.delete(event.code)
      return
    }
    event.preventDefault()
    this.keys.delete(event.code)
    this.suppressedEdgesUntilKeyUp.delete(event.code)
  }

  sample(): PartialControlIntent {
    if (
      this.target.document.querySelector(
        "dialog[open], [role=dialog][aria-modal=true]",
      )
    ) {
      this.clear()
      return {}
    }
    if (this.disposed || (this.keys.size === 0 && this.pressedEdges.size === 0))
      return {}
    const x =
      Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
      Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"))
    const y =
      Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) -
      Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"))
    const length = Math.max(1, Math.hypot(x, y))
    const lookX = Number(this.keys.has("KeyL")) - Number(this.keys.has("KeyJ"))
    const lookY = Number(this.keys.has("KeyI")) - Number(this.keys.has("KeyK"))
    const lookLength = Math.max(1, Math.hypot(lookX, lookY))
    const state = {
      move: { x: x / length, y: y / length },
      look: { x: lookX / lookLength, y: lookY / lookLength },
      run: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      jump: this.keys.has("Space") || this.pressedEdges.has("Space"),
      action: this.keys.has("KeyE") || this.pressedEdges.has("KeyE"),
      pause: this.keys.has("Escape") || this.pressedEdges.has("Escape"),
    }
    this.pressedEdges.clear()
    return state
  }

  clear() {
    for (const code of this.keys) {
      if (EDGE_CODES.has(code)) this.suppressedEdgesUntilKeyUp.add(code)
    }
    this.keys.clear()
    this.pressedEdges.clear()
  }

  dispose() {
    if (this.disposed) return
    this.clear()
    this.disposed = true
    this.target.removeEventListener("keydown", this.onKeyDown)
    this.target.removeEventListener("keyup", this.onKeyUp)
    this.target.removeEventListener("focusin", this.onFocusIn)
  }
}
