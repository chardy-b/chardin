import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { TouchControls } from "@/components/experience/touch-controls"
import { TouchInput } from "@/engine/input/touch-input"

describe("TouchControls", () => {
  it("provides semantic 44px control targets and normalized two-thumb input", () => {
    const { container } = render(<TouchControls />)
    const root = screen.getByLabelText("Touch controls")
    const move = screen.getByLabelText("Move traveler")
    const look = screen.getByLabelText("Look around")
    const jump = screen.getByRole("button", { name: "Jump" })
    const input = new TouchInput(root)

    for (const control of container.querySelectorAll(
      "button, [role='group']",
    )) {
      expect(control).toHaveClass("touch-target")
    }

    Object.defineProperty(move, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    })
    Object.defineProperty(look, "getBoundingClientRect", {
      value: () => ({ left: 100, top: 0, width: 100, height: 100 }),
    })
    const capture = vi.fn()
    Object.defineProperty(move, "setPointerCapture", { value: capture })
    fireEvent.pointerDown(move, { pointerId: 7, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(move, { pointerId: 7, clientX: 100, clientY: 0 })
    expect(capture).toHaveBeenCalledWith(7)
    expect(input.sample().move).toEqual({
      x: 1 / Math.sqrt(2),
      y: 1 / Math.sqrt(2),
    })

    Object.defineProperty(look, "setPointerCapture", { value: capture })
    fireEvent.pointerDown(look, { pointerId: 8, clientX: 150, clientY: 50 })
    fireEvent.pointerMove(look, { pointerId: 8, clientX: 175, clientY: 75 })
    expect(input.sample().look).toEqual({ x: 0.5, y: -0.5 })

    fireEvent.pointerDown(jump, { pointerId: 9 })
    expect(input.sample().jump).toBe(true)
    fireEvent.pointerUp(jump, { pointerId: 9 })
    fireEvent.pointerCancel(move, { pointerId: 7 })
    fireEvent.lostPointerCapture(look, { pointerId: 8 })
    expect(input.sample()).toMatchObject({
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      jump: false,
    })
    input.dispose()
  })

  it("cancels every active pointer and removes listeners on cleanup", () => {
    render(<TouchControls />)
    const root = screen.getByLabelText("Touch controls")
    const move = screen.getByLabelText("Move traveler")
    const input = new TouchInput(root)
    Object.defineProperty(move, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    })
    Object.defineProperty(move, "setPointerCapture", { value: vi.fn() })
    fireEvent.pointerDown(move, { pointerId: 1, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(move, { pointerId: 1, clientX: 100, clientY: 50 })
    expect(input.sample().move).toEqual({ x: 1, y: 0 })

    input.clear()
    expect(input.sample().move).toBeUndefined()
    input.dispose()
    fireEvent.pointerMove(move, { pointerId: 1, clientX: 0, clientY: 50 })
    expect(input.sample()).toEqual({})
  })
})
