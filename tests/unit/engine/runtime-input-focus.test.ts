import * as THREE from "three"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ExperienceRuntime } from "@/engine/contracts"
import { KeyboardInput } from "@/engine/input/keyboard-input"
import type { SkyStatus } from "@/engine/world/sky-controller"

// Only the GPU and unrelated asset boundary are substituted. Input, RAF loop,
// motor, collider, camera and sky controller are the production implementation.
const harness = vi.hoisted(() => ({ failPipeline: false }))
vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    dispose() {}
    info = { memory: { geometries: 0, textures: 0 } }
  },
}))
vi.mock("@/engine/render/render-pipeline", () => ({
  createRenderPipeline: () => {
    if (harness.failPipeline) throw new Error("partial construction")
    return {
      ready: Promise.resolve(),
      applyLightFrame: vi.fn(),
      configure: vi.fn(),
      resize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      setOutlineSignals: vi.fn(),
    }
  },
}))
vi.mock("@/engine/player/traveler-view", () => ({
  createTravelerView: () => ({
    object: new THREE.Group(),
    ready: Promise.resolve(),
    update: vi.fn(),
    dispose: vi.fn(),
  }),
}))
import { createThreeRuntime } from "@/engine/three-runtime"

let runtime: ExperienceRuntime | undefined
let now: number
let nextId: number
let frames: Map<number, FrameRequestCallback>
let canvas: HTMLCanvasElement
let details: HTMLDetailsElement
let summary: HTMLElement
let touch: HTMLDivElement
let pauseRequested: ReturnType<typeof vi.fn<() => void>>
let skyStatus: ReturnType<typeof vi.fn<(status: SkyStatus) => void>>
const snapshot = () => window.__CHARDIN_TEST__!.snapshot()

beforeEach(() => {
  harness.failPipeline = false
  now = 0
  nextId = 0
  frames = new Map()
  pauseRequested = vi.fn()
  skyStatus = vi.fn()
  vi.stubEnv("NEXT_PUBLIC_E2E_HOOKS", "true")
  // Expose snapshots, but never enable manual stepping or call step/stepInput.
  window.history.replaceState({}, "", "/")
  vi.spyOn(performance, "now").mockImplementation(() => now)
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextId, callback)
    return nextId
  })
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id)
  })
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal("navigator", {
    getGamepads: vi.fn(() => [] as (Gamepad | null)[]),
    hardwareConcurrency: 8,
  })
  canvas = document.createElement("canvas")
  canvas.tabIndex = 0
  details = document.createElement("details")
  summary = document.createElement("summary")
  summary.textContent = "Pavilion description"
  details.append(summary)
  touch = document.createElement("div")
  touch.innerHTML = '<button data-touch-input="jump">Jump</button>'
  document.body.append(canvas, details, touch)
})

afterEach(() => {
  runtime?.dispose()
  runtime = undefined
  canvas?.remove()
  details?.remove()
  touch?.remove()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function open() {
  runtime = createThreeRuntime(canvas, {} as WebGL2RenderingContext, {
    onPauseRequested: pauseRequested,
    onSkyStatus: skyStatus,
    touchRoot: touch,
  })
  await runtime.ready
  runtime.start()
  canvas.focus()
}

function frame(milliseconds: number) {
  now += milliseconds
  expect(frames.size).toBe(1)
  const [id, callback] = [...frames][0]!
  frames.delete(id)
  callback(now)
}

function key(
  target: EventTarget,
  type: "keydown" | "keyup",
  code: string,
  repeat = false,
) {
  const event = new KeyboardEvent(type, {
    code,
    repeat,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

// Reach the action zone with ordinary keyboard turns/walking and scheduled
// fixed steps. There is no pose setter, simulated intent injection or manual URL.
function walkToActionZone() {
  for (const target of snapshot().route) {
    const destination = new THREE.Vector3().fromArray(target)
    let arrived = false
    for (let ticks = 0; ticks < 1800; ticks++) {
      const state = snapshot()
      const delta = destination
        .clone()
        .sub(new THREE.Vector3().fromArray(state.position))
      if (delta.length() < 0.045) {
        arrived = true
        break
      }
      const up = new THREE.Vector3().fromArray(state.supportUp)
      const forward = new THREE.Vector3().fromArray(state.forward)
      const desired = delta.addScaledVector(up, -delta.dot(up)).normalize()
      const angle = Math.atan2(
        forward.clone().cross(desired).dot(up),
        forward.dot(desired),
      )
      const code = Math.abs(angle) < 0.08 ? "KeyW" : angle > 0 ? "KeyA" : "KeyD"
      key(canvas, "keydown", code)
      frame(1000 / 60)
      key(canvas, "keyup", code)
    }
    expect(arrived).toBe(true)
  }
  expect(skyStatus.mock.lastCall![0]).toMatchObject({
    viewingZone: true,
    viewing: false,
  })
}

function expectStationary(before: ReturnType<typeof snapshot>) {
  const after = snapshot()
  for (const field of ["position", "forward", "supportUp"] as const) {
    after[field].forEach((value, index) => {
      expect(value).toBeCloseTo(before[field][index]!, 12)
    })
  }
  expect(after.distance).toBeCloseTo(before.distance, 12)
  expect(after.grounded).toBe(true)
  expect(after.supportId).toBe(before.supportId)
  expect(after.cameraMode).toBe(before.cameraMode)
  expect(after.running).toBe(true)
  expect(pauseRequested).not.toHaveBeenCalled()
}

function expectEffect(code: string) {
  if (code === "Space") expect(snapshot().grounded).toBe(false)
  if (code === "KeyE") {
    expect(snapshot().cameraMode).toBe("view")
    expect(skyStatus.mock.lastCall![0]).toMatchObject({ viewing: true })
  }
  if (code === "Escape") {
    expect(snapshot().running).toBe(false)
    expect(pauseRequested).toHaveBeenCalledOnce()
  }
}

it.each(["Space", "KeyE", "Escape"])(
  "discards a RAF-latched %s edge on native summary focus and accepts a fresh canvas press",
  async (code) => {
    await open()
    if (code === "KeyE") walkToActionZone()
    const before = snapshot()
    key(canvas, "keydown", "KeyW")
    key(canvas, "keydown", code)
    frame(8)
    expect(snapshot().simulationTime).toBe(before.simulationTime)
    summary.focus()
    expect(document.activeElement).toBe(summary)
    expect(key(summary, "keyup", code).defaultPrevented).toBe(false)
    frame(9)
    expect(snapshot().simulationTime).toBeCloseTo(
      before.simulationTime + 1 / 60,
      12,
    )
    expectStationary(before)

    for (const nativeCode of ["Space", "Enter", "KeyE"]) {
      expect(key(summary, "keydown", nativeCode).defaultPrevented).toBe(false)
      expect(key(summary, "keyup", nativeCode).defaultPrevented).toBe(false)
    }
    summary.click()
    expect(details.open).toBe(true)
    frame(1000 / 60)
    expectStationary(before)

    canvas.focus()
    key(canvas, "keydown", code, true)
    frame(1000 / 60)
    expectStationary(before)
    key(canvas, "keyup", code)
    key(canvas, "keydown", code)
    frame(1000 / 60)
    expectEffect(code)
  },
)

it.each(["Space", "KeyE", "Escape"])(
  "accepts a fresh %s after UI focus returns to canvas before another sample",
  async (code) => {
    await open()
    if (code === "KeyE") walkToActionZone()
    key(canvas, "keydown", code)
    frame(8)
    summary.focus()
    key(summary, "keyup", code)
    canvas.focus()
    key(canvas, "keydown", code)
    frame(9)
    expectEffect(code)
  },
)

it.each(["Space", "KeyE", "Escape"])(
  "retains a short %s canvas tap across multiple zero-step RAF frames without focus transfer",
  async (code) => {
    await open()
    if (code === "KeyE") walkToActionZone()
    const before = snapshot()
    key(canvas, "keydown", code)
    key(canvas, "keyup", code)
    frame(4)
    frame(4)
    expect(snapshot().simulationTime).toBe(before.simulationTime)
    frame(9)
    expectEffect(code)
    if (code === "KeyE") {
      // The latched action must be consumed once, even across multiple substeps.
      frame(50)
      expectEffect(code)
    }
  },
)

it("clears a sampled edge on pause/resume and suppresses held repeats", async () => {
  await open()
  const before = snapshot()
  key(canvas, "keydown", "Space")
  frame(8)
  runtime!.pause()
  runtime!.resume()
  key(canvas, "keydown", "Space", true)
  frame(17)
  expectStationary(before)
  key(canvas, "keyup", "Space")
  key(canvas, "keydown", "Space")
  frame(17)
  expectEffect("Space")
})

it.each(["touch", "gamepad"])(
  "accepts fresh %s gameplay after UI relinquishment",
  async (source) => {
    await open()
    key(canvas, "keydown", "Space")
    frame(8)
    summary.focus()
    frame(9)
    expect(snapshot().grounded).toBe(true)
    if (source === "touch") {
      const button = touch.querySelector("button")!
      // JSDOM has no PointerEvent; dispatch the actual fields consumed by input.
      const pointer = new Event("pointerdown", {
        bubbles: true,
        cancelable: true,
      })
      Object.assign(pointer, { pointerId: 1 })
      button.dispatchEvent(pointer)
    } else {
      const button = { pressed: false, touched: false, value: 0 }
      const pad = {
        connected: true,
        mapping: "standard",
        index: 0,
        axes: [0, 0, 0, 0],
        buttons: [button],
      } as unknown as Gamepad
      vi.mocked(navigator.getGamepads).mockReturnValue([pad])
      frame(1000 / 60)
      button.pressed = true
    }
    frame(1000 / 60)
    expectEffect("Space")
  },
)

it.each([false, true])(
  "removes focus ownership on teardown (construction rollback: %s) and ignores stale callbacks after reconstruction",
  async (rollback) => {
    const add = vi.spyOn(window, "addEventListener")
    const remove = vi.spyOn(window, "removeEventListener")
    const clear = vi.spyOn(KeyboardInput.prototype, "clear")
    harness.failPipeline = rollback
    if (rollback) await expect(open()).rejects.toThrow("partial construction")
    else {
      await open()
      runtime!.dispose()
      runtime!.dispose()
    }
    const listener = add.mock.calls.find(([type]) => type === "focusin")![1]
    expect(remove.mock.calls.filter(([type]) => type === "focusin")).toEqual([
      ["focusin", listener],
    ])
    expect(frames.size).toBe(0)
    expect(window.__CHARDIN_TEST__).toBeUndefined()
    summary.focus()
    const event = new FocusEvent("focusin", { bubbles: true })
    summary.dispatchEvent(event)
    clear.mockClear()
    ;(listener as EventListener)(event)
    expect(clear).not.toHaveBeenCalled()

    harness.failPipeline = false
    await open()
    key(canvas, "keydown", "Space")
    frame(8)
    clear.mockClear()
    ;(listener as EventListener)(event)
    expect(clear).not.toHaveBeenCalled()
    frame(9)
    expectEffect("Space")
  },
)
