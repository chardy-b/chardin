import type { InputAdapter, PartialControlIntent } from "@/engine/input/types"

type VectorName = "move" | "look"

export class TouchInput implements InputAdapter {
  private state: PartialControlIntent = {}
  private readonly pressedEdges = new Set<string>()
  private readonly pointers = new Map<
    number,
    { kind: string; target: HTMLElement }
  >()
  private disposed = false

  constructor(private readonly root: HTMLElement) {
    root.addEventListener("pointerdown", this.onPointerDown)
    root.addEventListener("pointermove", this.onPointerMove)
    root.addEventListener("pointerup", this.onPointerEnd)
    root.addEventListener("pointercancel", this.onPointerEnd)
    root.addEventListener("lostpointercapture", this.onPointerEnd)
  }

  private onPointerDown = (event: PointerEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-touch-input]",
    )
    if (!target || !this.root.contains(target)) return
    event.preventDefault()
    const kind = target.dataset.touchInput ?? ""
    this.pointers.set(event.pointerId, { kind, target })
    try {
      target.setPointerCapture?.(event.pointerId)
    } catch {
      // A pointer may be cancelled by the browser before capture is established.
    }
    if (kind === "move" || kind === "look")
      this.updateVector(kind, target, event)
    else if (
      kind === "run" ||
      kind === "jump" ||
      kind === "action" ||
      kind === "pause"
    )
      this.state[kind] = true
    if (kind === "jump" || kind === "action" || kind === "pause")
      this.pressedEdges.add(kind)
  }

  private onPointerMove = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId)
    if (pointer && (pointer.kind === "move" || pointer.kind === "look")) {
      this.updateVector(pointer.kind, pointer.target, event)
    }
  }

  private updateVector(
    kind: VectorName,
    target: HTMLElement,
    event: PointerEvent,
  ) {
    const bounds = target.getBoundingClientRect()
    const halfWidth = Math.max(bounds.width / 2, 1)
    const halfHeight = Math.max(bounds.height / 2, 1)
    const rawX = (event.clientX - (bounds.left + halfWidth)) / halfWidth
    const rawY = (bounds.top + halfHeight - event.clientY) / halfHeight
    const length = Math.max(1, Math.hypot(rawX, rawY))
    this.state[kind] = { x: rawX / length, y: rawY / length }
  }

  private onPointerEnd = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId)
    if (!pointer) return
    this.pointers.delete(event.pointerId)
    if (pointer.kind === "move" || pointer.kind === "look")
      this.state[pointer.kind] = { x: 0, y: 0 }
    else if (
      pointer.kind === "run" ||
      pointer.kind === "jump" ||
      pointer.kind === "action" ||
      pointer.kind === "pause"
    )
      this.state[pointer.kind] = false
  }

  sample() {
    if (this.disposed) return {}
    const state = { ...this.state }
    for (const kind of this.pressedEdges) {
      if (kind === "jump" || kind === "action" || kind === "pause")
        state[kind] = true
    }
    this.pressedEdges.clear()
    return state
  }
  clear() {
    this.pointers.clear()
    this.pressedEdges.clear()
    this.state = {}
  }
  dispose() {
    if (this.disposed) return
    this.clear()
    this.disposed = true
    this.root.removeEventListener("pointerdown", this.onPointerDown)
    this.root.removeEventListener("pointermove", this.onPointerMove)
    this.root.removeEventListener("pointerup", this.onPointerEnd)
    this.root.removeEventListener("pointercancel", this.onPointerEnd)
    this.root.removeEventListener("lostpointercapture", this.onPointerEnd)
  }
}
