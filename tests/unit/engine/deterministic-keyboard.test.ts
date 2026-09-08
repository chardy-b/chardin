import * as THREE from "three"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

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
    applyLightFrame: vi.fn(),
    configure: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    setOutlineSignals: vi.fn(),
  }),
}))
vi.mock("@/engine/player/traveler-view", () => ({
  createTravelerView: () => ({
    object: new THREE.Group(),
    ready: Promise.resolve(),
    applyLightFrame: vi.fn(),
    update: vi.fn(),
    dispose: vi.fn(),
  }),
}))
import { createExperience } from "@/engine/create-experience"
import type { Experience } from "@/engine/contracts"

let experience: Experience | undefined
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_E2E_HOOKS", "true")
  window.history.replaceState({}, "", "/?e2e=1")
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
  vi.stubGlobal("navigator", { getGamepads: () => [], hardwareConcurrency: 8 })
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1)
})
afterEach(() => {
  experience?.dispose()
  experience = undefined
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.history.replaceState({}, "", "/")
})
const key = (type: "keydown" | "keyup", code: string, repeat = false) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, repeat }))
async function open() {
  const onState = vi.fn()
  let ready!: () => void
  const loaded = new Promise<void>((resolve) => {
    ready = resolve
  })
  experience = createExperience({
    canvas: document.createElement("canvas"),
    getWebGL2Context: () => ({}) as WebGL2RenderingContext,
    onState: (state) => {
      onState(state)
      if (state.status === "ready") ready()
    },
  })
  await loaded
  return { api: window.__CHARDIN_TEST__!, onState }
}

it("steps real keyboard run, Escape pause, held-edge resume and fresh walk without wall-clock frames", async () => {
  const { api, onState } = await open()
  api.stepInput(60)
  expect(api.snapshot().simulationTime).toBe(0)
  experience!.start()
  key("keydown", "ShiftLeft")
  key("keydown", "KeyW")
  api.stepInput(60)
  key("keyup", "KeyW")
  key("keyup", "ShiftLeft")
  expect(api.snapshot().distance).toBeCloseTo(3.3, 4)
  expect(api.snapshot().distance).toBeGreaterThan(0.5)
  expect(api.snapshot().simulationTime).toBeCloseTo(1, 10)
  key("keydown", "Escape")
  api.stepInput(1)
  expect(onState).toHaveBeenLastCalledWith({ status: "paused" })
  const paused = api.snapshot()
  for (const code of ["Space", "KeyE", "KeyW"]) key("keydown", code)
  api.stepInput(30)
  expect(api.snapshot()).toEqual(paused)
  key("keyup", "KeyW")
  experience!.resume()
  for (const code of ["Escape", "Space", "KeyE"]) key("keydown", code, true)
  api.stepInput(9)
  expect(api.snapshot().running).toBe(true)
  expect(api.snapshot().grounded).toBe(true)
  api
    .snapshot()
    .position.forEach((value, index) =>
      expect(value).toBeCloseTo(paused.position[index], 10),
    )
  expect(api.snapshot().distance).toBeCloseTo(paused.distance, 10)
  for (const code of ["Escape", "Space", "KeyE"]) key("keyup", code)
  key("keydown", "KeyW")
  api.stepInput(30)
  key("keyup", "KeyW")
  expect(api.snapshot().distance - paused.distance).toBeCloseTo(0.825, 4)
  expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  experience!.dispose()
  const stopped = api.snapshot()
  api.stepInput(60)
  expect(api.snapshot()).toEqual(stopped)
})

it("keeps scripted-intent stepping independent of held hardware input", async () => {
  const { api } = await open()
  experience!.start()
  key("keydown", "KeyW")
  api.step(60)
  expect(api.snapshot().distance).toBe(0)
  api.stepInput(60)
  expect(api.snapshot().distance).toBeCloseTo(1.65, 4)
  key("keyup", "KeyW")
})

it("resumes grounded after held keys originate on the focused pause control", async () => {
  const { api } = await open()
  experience!.start()
  key("keydown", "ShiftLeft")
  key("keydown", "KeyW")
  api.stepInput(60)
  key("keyup", "KeyW")
  key("keyup", "ShiftLeft")
  key("keydown", "Escape")
  api.stepInput(1)
  const paused = api.snapshot()
  expect(paused.grounded).toBe(true)
  expect(paused.supportId).toBe("planet")

  const resume = document.createElement("button")
  document.body.append(resume)
  resume.focus()
  try {
    for (const code of ["Space", "KeyE", "KeyW"])
      resume.dispatchEvent(
        new KeyboardEvent("keydown", { code, bubbles: true }),
      )
    api.stepInput(30)
    key("keyup", "KeyW")
    expect(api.snapshot()).toEqual(paused)
    experience!.resume()
    resume.blur()
    for (const code of ["Escape", "Space", "KeyE"]) key("keydown", code, true)
    api.stepInput(9)
    const resumed = api.snapshot()
    expect(resumed.running).toBe(true)
    expect(resumed.grounded).toBe(true)
    expect(resumed.supportId).toBe("planet")
    expect(resumed.distance).toBeCloseTo(paused.distance, 10)
    resumed.position.forEach((value, i) =>
      expect(value).toBeCloseTo(paused.position[i], 10),
    )
    expect(resumed.simulationTime - paused.simulationTime).toBeCloseTo(
      9 / 60,
      10,
    )

    // Release and a fresh press still jump, then land on the spherical world.
    for (const code of ["Escape", "Space", "KeyE"]) key("keyup", code)
    key("keydown", "Space")
    api.stepInput(1)
    expect(api.snapshot().grounded).toBe(false)
    key("keyup", "Space")
    api.stepInput(90)
    expect(api.snapshot().grounded).toBe(true)
    expect(api.snapshot().supportId).toBe("planet")
    expect(Math.hypot(...api.snapshot().position)).toBeCloseTo(5.03, 10)
  } finally {
    resume.remove()
  }
})

it("ignores input stepping outside manual mode and rejects unbounded steps", async () => {
  const { api } = await open()
  experience!.start()
  key("keydown", "KeyW")
  const before = api.snapshot()
  for (const frames of [-1, 0.5, NaN, Infinity, 3601]) api.stepInput(frames)
  expect(api.snapshot()).toEqual(before)
  experience!.dispose()
  window.history.replaceState({}, "", "/")
  const ordinary = await open()
  experience!.start()
  key("keydown", "KeyW")
  ordinary.api.stepInput(60)
  expect(ordinary.api.snapshot().distance).toBe(0)
  key("keyup", "KeyW")
})
