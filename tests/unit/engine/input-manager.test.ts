import { beforeEach, describe, expect, it, vi } from "vitest"

import { GamepadInput } from "@/engine/input/gamepad-input"
import { InputManager } from "@/engine/input/input-manager"
import { KeyboardInput } from "@/engine/input/keyboard-input"
import type { InputAdapter, PartialControlIntent } from "@/engine/input/types"

function adapter(state: PartialControlIntent): InputAdapter {
  return { sample: () => state, clear: vi.fn(), dispose: vi.fn() }
}

type MutableGamepad = Omit<Gamepad, "axes" | "buttons"> & {
  axes: number[]
  buttons: GamepadButton[]
}

function gamepad(overrides: Partial<Gamepad> = {}): MutableGamepad {
  const buttons = Array.from({ length: 17 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }))
  return {
    axes: [0, 0, 0, 0],
    buttons,
    connected: true,
    id: "standard test pad",
    index: 0,
    mapping: "standard",
    timestamp: 0,
    vibrationActuator: null,
    ...overrides,
  } as MutableGamepad
}

describe("InputManager", () => {
  it("clamps vectors, chooses the greatest magnitude, ORs held controls, and consumes edges once", () => {
    const weak = adapter({
      move: { x: 0.2, y: 0.2 },
      look: { x: 4, y: 0 },
      run: true,
      action: true,
    })
    const strong = adapter({
      move: { x: -2, y: 0 },
      look: { x: 0.5, y: 0.5 },
      jump: true,
      pause: true,
    })
    const manager = new InputManager([weak, strong])

    expect(manager.sample()).toEqual({
      move: { x: -1, y: 0 },
      look: { x: 1, y: 0 },
      run: true,
      jumpPressed: true,
      actionPressed: true,
      pausePressed: true,
    })
    expect(manager.sample()).toMatchObject({
      jumpPressed: false,
      actionPressed: false,
      pausePressed: false,
    })

    manager.dispose()
    expect(weak.dispose).toHaveBeenCalledOnce()
    expect(strong.dispose).toHaveBeenCalledOnce()
  })

  it("clears every adapter on blur, visibility loss, pause, and disposal", () => {
    const source = adapter({ run: true })
    const manager = new InputManager([source])

    window.dispatchEvent(new Event("blur"))
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    })
    document.dispatchEvent(new Event("visibilitychange"))
    manager.pause()
    manager.dispose()

    expect(source.clear).toHaveBeenCalledTimes(4)
    expect(source.dispose).toHaveBeenCalledOnce()
    expect(manager.sample()).toEqual({
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      run: false,
      jumpPressed: false,
      actionPressed: false,
      pausePressed: false,
    })
  })
})

describe("KeyboardInput", () => {
  it("normalizes WASD/arrows and held/edge-capable standard actions", () => {
    const keyboard = new KeyboardInput(window)
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }))

    expect(keyboard.sample()).toEqual({
      move: { x: 1 / Math.sqrt(2), y: 1 / Math.sqrt(2) },
      run: true,
      jump: true,
      action: true,
      pause: true,
    })

    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }))
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" }))
    keyboard.clear()
    expect(keyboard.sample()).toEqual({})
    keyboard.dispose()
  })
})

describe("GamepadInput", () => {
  let pads: (Gamepad | null)[]

  beforeEach(() => {
    pads = []
    vi.stubGlobal("navigator", {
      ...window.navigator,
      getGamepads: () => pads,
    })
  })

  it("applies radial dead zones and maps standard axes/buttons", () => {
    const pad = gamepad({ axes: [0.1, -0.1, 0.8, -0.6] })
    pad.buttons[0] = { pressed: true, touched: true, value: 1 }
    pad.buttons[1] = { pressed: true, touched: true, value: 1 }
    pad.buttons[9] = { pressed: true, touched: true, value: 1 }
    pad.buttons[10] = { pressed: true, touched: true, value: 1 }
    pads = [pad]
    const input = new GamepadInput(() => pads, 0.2)

    expect(input.sample()).toEqual({
      move: { x: 0, y: 0 },
      look: { x: 0.8, y: 0.6 },
      run: true,
      jump: true,
      action: true,
      pause: true,
    })
  })

  it("returns neutral state across disconnect and suppresses held input on reconnect/clear until release", () => {
    const input = new GamepadInput(() => pads)
    const pad = gamepad({ axes: [1, 0, 0, 0] })
    pad.buttons[0] = { pressed: true, touched: true, value: 1 }
    pads = [pad]
    expect(input.sample()).toMatchObject({ jump: true })

    pad.axes[0] = 0
    pad.buttons[0] = { pressed: false, touched: false, value: 0 }
    expect(input.sample()).toMatchObject({ move: { x: 0, y: 0 }, jump: false })
    pad.buttons[0] = { pressed: true, touched: true, value: 1 }
    expect(input.sample()).toMatchObject({ jump: true })

    pads = [null]
    expect(input.sample()).toEqual({})
    pads = [pad]
    expect(input.sample()).toEqual({})
    input.clear()
    expect(input.sample()).toEqual({})
  })
})
