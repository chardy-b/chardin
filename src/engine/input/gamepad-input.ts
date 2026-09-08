import type { InputAdapter, PartialControlIntent } from "@/engine/input/types"

type GetGamepads = () => readonly (Gamepad | null)[]

function radialDeadZone(x: number, y: number, deadZone: number) {
  const magnitude = Math.min(Math.hypot(x, y), 1)
  if (magnitude <= deadZone) return { x: 0, y: 0 }
  const scaled = (magnitude - deadZone) / (1 - deadZone)
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled }
}

export class GamepadInput implements InputAdapter {
  private activeIndex: number | null = null
  private suppressUntilNeutral = false
  private hasSeenPad = false
  private disposed = false

  constructor(
    private readonly getGamepads: GetGamepads = () => navigator.getGamepads(),
    private readonly deadZone = 0.2,
  ) {}

  sample(): PartialControlIntent {
    if (this.disposed) return {}
    const pad = this.getGamepads().find(
      (candidate) => candidate?.connected && candidate.mapping === "standard",
    )
    if (!pad) {
      this.activeIndex = null
      this.suppressUntilNeutral = true
      return {}
    }
    if (pad.index !== this.activeIndex) {
      this.activeIndex = pad.index
      this.suppressUntilNeutral ||= this.hasSeenPad
      this.hasSeenPad = true
    }
    const move = radialDeadZone(
      pad.axes[0] ?? 0,
      -(pad.axes[1] ?? 0),
      this.deadZone,
    )
    const look = radialDeadZone(
      pad.axes[2] ?? 0,
      -(pad.axes[3] ?? 0),
      this.deadZone,
    )
    const jump = Boolean(pad.buttons[0]?.pressed)
    const action = Boolean(pad.buttons[1]?.pressed)
    const pause = Boolean(pad.buttons[9]?.pressed)
    const run = Boolean(pad.buttons[10]?.pressed)
    const neutral =
      Math.hypot(move.x, move.y) === 0 &&
      Math.hypot(look.x, look.y) === 0 &&
      !jump &&
      !action &&
      !pause &&
      !run
    if (this.suppressUntilNeutral) {
      if (!neutral) return {}
      this.suppressUntilNeutral = false
    }
    return { move, look, run, jump, action, pause }
  }

  clear() {
    this.suppressUntilNeutral = true
  }
  dispose() {
    this.clear()
    this.disposed = true
  }
}
