import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden")

  afterEach(() => {
    if (originalHidden)
      Object.defineProperty(document, "hidden", originalHidden)
    else Reflect.deleteProperty(document, "hidden")
  })
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

  it("discards input buffered while paused at the resume boundary", () => {
    let state: PartialControlIntent = { action: true, pause: true }
    const source: InputAdapter = {
      sample: () => state,
      clear: vi.fn(() => {
        state = {}
      }),
      dispose: vi.fn(),
    }
    const manager = new InputManager([source])

    expect(manager.sample()).toMatchObject({
      actionPressed: true,
      pausePressed: true,
    })
    manager.pause()
    state = { jump: true, action: true, pause: true }

    manager.resume()

    expect(manager.sample()).toMatchObject({
      jumpPressed: false,
      actionPressed: false,
      pausePressed: false,
    })
    expect(source.clear).toHaveBeenCalledTimes(2)
    manager.dispose()
  })
})

describe("KeyboardInput", () => {
  it("normalizes movement/look and latches short action taps once", () => {
    const keyboard = new KeyboardInput(window)
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyI" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL" }))

    expect(keyboard.sample()).toEqual({
      move: { x: 1 / Math.sqrt(2), y: 1 / Math.sqrt(2) },
      look: { x: 1 / Math.sqrt(2), y: 1 / Math.sqrt(2) },
      run: true,
      jump: true,
      action: true,
      pause: true,
    })

    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }))
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" }))
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape" }))
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }))
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Escape" }))
    expect(keyboard.sample()).toMatchObject({ pause: true })
    expect(keyboard.sample()).toMatchObject({ pause: false })
    keyboard.clear()
    expect(keyboard.sample()).toEqual({})
    keyboard.dispose()
  })

  it("does not handle gameplay keys originating in interactive elements", () => {
    const keyboard = new KeyboardInput(window)
    const button = document.createElement("button")
    const input = document.createElement("input")
    document.body.append(button, input)

    const space = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
    })
    button.dispatchEvent(space)
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, code: "KeyW" }),
    )

    expect(space.defaultPrevented).toBe(false)
    expect(keyboard.sample()).toEqual({})
    keyboard.dispose()
    button.remove()
    input.remove()
  })

  it.each(["Escape", "Space", "KeyE"])(
    "requires a fresh %s press after focus leaves a control or modal",
    (code) => {
      const keyboard = new KeyboardInput(window)
      const button = document.createElement("button")
      const dialog = document.createElement("dialog")
      document.body.append(button, dialog)
      try {
        for (const target of [button, window]) {
          dialog.open = target === window
          const press = new KeyboardEvent("keydown", {
            code,
            bubbles: true,
            cancelable: true,
          })
          target.dispatchEvent(press)
          expect(press.defaultPrevented).toBe(false)
          expect(keyboard.sample()).toEqual({})
          dialog.open = false
          keyboard.clear()
          window.dispatchEvent(
            new KeyboardEvent("keydown", { code, repeat: true }),
          )
          expect(keyboard.sample()).toEqual({})
          window.dispatchEvent(new KeyboardEvent("keyup", { code }))
          window.dispatchEvent(new KeyboardEvent("keydown", { code }))
          expect(keyboard.sample()).toMatchObject({
            jump: code === "Space",
            action: code === "KeyE",
            pause: code === "Escape",
          })
          window.dispatchEvent(new KeyboardEvent("keyup", { code }))
          expect(keyboard.sample()).toEqual({})
        }
      } finally {
        keyboard.dispose()
        button.remove()
        dialog.remove()
      }
    },
  )

  it.each(["Escape", "Space", "KeyE"])(
    "does not recreate a %s edge from auto-repeat after clear",
    (code) => {
      const keyboard = new KeyboardInput(window)
      window.dispatchEvent(new KeyboardEvent("keydown", { code }))

      keyboard.clear()
      window.dispatchEvent(new KeyboardEvent("keydown", { code, repeat: true }))

      expect(keyboard.sample()).toEqual({})

      window.dispatchEvent(new KeyboardEvent("keyup", { code }))
      window.dispatchEvent(new KeyboardEvent("keydown", { code }))
      window.dispatchEvent(new KeyboardEvent("keyup", { code }))
      expect(keyboard.sample()).toMatchObject({
        jump: code === "Space",
        action: code === "KeyE",
        pause: code === "Escape",
      })
      expect(keyboard.sample()).toEqual({})
      keyboard.dispose()
    },
  )
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

  afterEach(() => vi.unstubAllGlobals())

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

  it("keeps clear suppression when the first gamepad connects", () => {
    const input = new GamepadInput(() => pads)
    input.clear()

    const pad = gamepad()
    pad.buttons[0] = { pressed: true, touched: true, value: 1 }
    pads = [pad]
    expect(input.sample()).toEqual({})

    pad.buttons[0] = { pressed: false, touched: false, value: 0 }
    expect(input.sample()).toMatchObject({ jump: false })

    pad.buttons[0] = { pressed: true, touched: true, value: 1 }
    expect(input.sample()).toMatchObject({ jump: true })
  })
})
