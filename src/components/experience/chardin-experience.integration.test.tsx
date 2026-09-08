import * as THREE from "three"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { ChardinExperience } from "@/components/experience/chardin-experience"
import { walkToSkyspacePoint } from "../../../tests/e2e/helpers/skyspace-route"

// Actual component, Experience, runtime, sky controller, input and motor/collider.
// Substitute only GPU rendering and the unrelated asynchronous Traveler asset.
vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    dispose() {}
    info = { memory: { geometries: 0, textures: 0 } }
  },
}))
vi.mock("@/engine/render/render-pipeline", () => ({
  createRenderPipeline: () => ({
    ready: Promise.resolve(),
    applyLightFrame() {},
    configure() {},
    resize() {},
    render() {},
    dispose() {},
  }),
}))
vi.mock("@/engine/player/traveler-view", () => ({
  createTravelerView: () => ({
    object: new THREE.Group(),
    ready: Promise.resolve(),
    update() {},
    dispose() {},
  }),
}))

let reduced = false
let motion: ((event: Pick<MediaQueryListEvent, "matches">) => void) | undefined
beforeEach(() => {
  reduced = false
  motion = undefined
  vi.stubEnv("NEXT_PUBLIC_E2E_HOOKS", "true")
  window.history.replaceState({}, "", "/?e2e=1")
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced
    },
    addEventListener(_type: string, listener: typeof motion) {
      motion = listener
    },
    removeEventListener() {},
  }))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal("navigator", { getGamepads: () => [], hardwareConcurrency: 8 })
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as WebGL2RenderingContext,
  )
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.history.replaceState({}, "", "/")
})

async function enterChamber() {
  const user = userEvent.setup()
  render(<ChardinExperience />)
  await user.click(await screen.findByRole("button", { name: "Enter Chardin" }))
  act(() => {
    for (const point of [0, 1, 2, 3, 4]) walkToSkyspacePoint({ point })
  })
  const api = window.__CHARDIN_TEST__!
  expect(api.snapshot().grounded).toBe(true)
  expect(api.snapshot().supportId).toBe("floor")
  await user.click(screen.getByText("Light and view"))
  return { user, api }
}

function preference(matches: boolean) {
  act(() => {
    reduced = matches
    expect(motion).toBeTypeOf("function")
    motion!({ matches })
  })
}

it.each([false, true])(
  "offers a working Restart after final still selection (initial reduced motion %s)",
  async (initialReduced) => {
    reduced = initialReduced
    const { user, api } = await enterChamber()
    for (let i = 0; i < 5; i++)
      await user.click(screen.getByRole("button", { name: "Next still view" }))
    const restart = screen.getByRole("button", {
      name: "Restart light sequence",
    })
    expect(
      screen.queryByRole("button", { name: "Continue light sequence" }),
    ).not.toBeInTheDocument()
    expect(api.snapshot().sky).toMatchObject({
      tick: 10800,
      playback: "complete",
    })
    preference(true)
    expect(restart).toBeDisabled()
    await user.click(restart)
    act(() => api.step(2))
    expect(api.snapshot().sky).toMatchObject({
      tick: 10800,
      playback: "complete",
    })
    preference(false)
    expect(restart).toBeEnabled()
    act(() => api.step(2))
    expect(api.snapshot().sky).toMatchObject({
      tick: 10800,
      playback: "complete",
    })
    await user.click(
      screen.getByRole("button", { name: "Previous still view" }),
    )
    expect(api.snapshot().sky).toMatchObject({ tick: 8100, playback: "still" })
    expect(
      screen.getByRole("button", { name: "Continue light sequence" }),
    ).toBeEnabled()
    await user.click(screen.getByRole("button", { name: "Next still view" }))
    expect(api.snapshot().sky).toMatchObject({
      tick: 10800,
      playback: "complete",
    })
    await user.click(
      screen.getByRole("button", { name: "Restart light sequence" }),
    )
    expect(api.snapshot().sky).toMatchObject({ tick: 0, playback: "playing" })
    act(() => api.step(1))
    expect(api.snapshot().sky.tick).toBe(1)
  },
)

it("keeps Restart after Still light at normal completion and Continue at an earlier endpoint", async () => {
  const { user, api } = await enterChamber()
  act(() => api.setSkyTick(10799))
  await user.click(
    screen.getByRole("button", { name: "Continue light sequence" }),
  )
  act(() => api.step(1))
  expect(api.snapshot().sky).toMatchObject({
    tick: 10800,
    playback: "complete",
  })
  await user.click(screen.getByRole("button", { name: "Still light" }))
  await user.click(
    screen.getByRole("button", { name: "Restart light sequence" }),
  )
  expect(api.snapshot().sky).toMatchObject({ tick: 0, playback: "playing" })
  await user.click(screen.getByRole("button", { name: "Next still view" }))
  preference(true)
  preference(false)
  act(() => api.step(2))
  expect(api.snapshot().sky).toMatchObject({ tick: 1800, playback: "paused" })
  await user.click(
    screen.getByRole("button", { name: "Continue light sequence" }),
  )
  act(() => api.step(1))
  expect(api.snapshot().sky.tick).toBe(1801)
})

it.each(["Space", "Enter"])(
  "leaves %s disclosure activation uncanceled and the production motor stationary",
  async (code) => {
    const { api } = await enterChamber()
    const summary = screen.getByText("Light and view")
    const details = summary.closest("details")!
    const canvas = screen.getByLabelText("Chardin spherical world")
    const before = api.snapshot()
    const key = (target: EventTarget, type: string, repeat = false) => {
      const event = new KeyboardEvent(type, {
        code,
        key: code === "Space" ? " " : "Enter",
        repeat,
        bubbles: true,
        cancelable: true,
      })
      target.dispatchEvent(event)
      return event
    }
    summary.focus()
    expect(summary).toHaveFocus()
    for (const repeat of [false, true]) {
      expect(key(summary, "keydown", repeat).defaultPrevented).toBe(false)
      act(() => api.stepInput(1))
    }
    expect(key(summary, "keyup").defaultPrevented).toBe(false)
    // JSDOM does not synthesize summary keyboard default activation. Dispatch
    // its resulting click separately; never install a replacement key handler.
    const open = details.open
    act(() => summary.click())
    expect(details.open).toBe(!open)
    key(summary, "keydown")
    canvas.focus()
    key(canvas, "keydown", true)
    act(() => api.stepInput(2))
    key(canvas, "keyup")
    // A queued gameplay edge must also be relinquished on focus entering UI.
    key(canvas, "keydown")
    summary.focus()
    expect(key(summary, "keyup").defaultPrevented).toBe(false)
    act(() => api.stepInput(2))
    const after = api.snapshot()
    expect(after.grounded).toBe(true)
    expect(after.supportId).toBe(before.supportId)
    expect(after.cameraMode).toBe(before.cameraMode)
    for (const field of ["position", "forward", "supportUp"] as const)
      after[field].forEach((value, i) =>
        expect(value).toBeCloseTo(before[field][i], 10),
      )
    expect(after.distance).toBeCloseTo(before.distance, 10)
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    if (code === "Space") {
      canvas.focus()
      key(canvas, "keydown")
      act(() => api.stepInput(1))
      expect(api.snapshot().grounded).toBe(false)
      key(canvas, "keyup")
    }
  },
)
