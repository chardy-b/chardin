import { expect, it, vi } from "vitest"
import {
  retainContextLossControl,
  finishWebGLFrame,
} from "../../e2e/helpers/webgl"

it("restores through the retained extension when queries return null during loss", () => {
  let lost = false
  const extension = {
    loseContext: vi.fn(() => {
      lost = true
    }),
    restoreContext: vi.fn(() => {
      lost = false
    }),
  }
  const getExtension = vi.fn(() => (lost ? null : extension))
  const canvas = {
    getContext: () => ({ getExtension }),
  } as unknown as HTMLCanvasElement
  const control = retainContextLossControl(canvas)
  control.lose()
  expect(lost).toBe(true)
  control.restore()
  expect(lost).toBe(false)
  expect(getExtension).toHaveBeenCalledOnce()
  expect(extension.restoreContext).toHaveBeenCalledOnce()
})

it("waits for actual GPU completion before requesting screenshot pixels", () => {
  const finish = vi.fn()
  finishWebGLFrame({
    getContext: () => ({ finish }),
  } as unknown as HTMLCanvasElement)
  expect(finish).toHaveBeenCalledOnce()
})
