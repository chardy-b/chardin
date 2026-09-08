import * as THREE from "three"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TravelerState } from "@/engine/contracts"
import type { CharacterAsset } from "@/engine/assets/character-loader"
import { createTravelerView } from "@/engine/player/traveler-view"
import { createExperience } from "@/engine/create-experience"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const state = (locomotion: TravelerState["locomotion"]): TravelerState => ({
  position: new THREE.Vector3(0, 5, 0),
  forward: new THREE.Vector3(0, 0, -1),
  radialVelocity: 0,
  grounded: locomotion !== "airborne",
  locomotion,
})

function fakeAsset(): CharacterAsset {
  const root = new THREE.Group()
  root.name = "Traveler"
  const times = [0, 1]
  const clips = Object.fromEntries(
    ["idle", "walk", "run", "jump"].map((name) => [
      name,
      new THREE.AnimationClip(name, 1, [
        new THREE.NumberKeyframeTrack(".position[y]", times, [0, 0.01]),
      ]),
    ]),
  ) as unknown as CharacterAsset["clips"]
  return { root, clips, attachments: {}, dispose: vi.fn() }
}

function idleOnlyAsset(): CharacterAsset {
  const root = new THREE.Group()
  root.name = "Traveler"
  const idle = new THREE.AnimationClip("Idle", 1, [
    new THREE.NumberKeyframeTrack(".position[y]", [0, 1], [0, 1]),
  ])
  return {
    root,
    clips: { idle },
    attachments: {},
    dispose: vi.fn(),
  }
}

describe("traveler view", () => {
  it("keeps a visible fallback while loading and on failure", async () => {
    let reject!: (reason: Error) => void
    const view = createTravelerView({
      load: () => new Promise((_, fail) => (reject = fail)),
    })
    expect(view.object.visible).toBe(true)
    expect(view.object.children.length).toBeGreaterThan(0)
    reject(new Error("offline"))
    await view.ready
    expect(view.object.children.length).toBeGreaterThan(0)
    view.dispose()
  })

  it("maps fixed-step motor states, crossfades, and lands from jump", async () => {
    const asset = fakeAsset()
    const view = createTravelerView({ load: async () => asset })
    await view.ready
    view.update(state("idle"), 1 / 60)
    view.update(state("run"), 1 / 60)
    expect(view.activeAnimation()).toBe("run")
    view.update(state("airborne"), 1 / 60)
    expect(view.activeAnimation()).toBe("jump")
    view.update(state("walk"), 1 / 60)
    expect(view.activeAnimation()).toBe("walk")
    view.dispose()
    expect(asset.dispose).toHaveBeenCalledOnce()
  })

  it("continuously advances idle fallback across optional locomotion states", async () => {
    const asset = idleOnlyAsset()
    const view = createTravelerView({ load: async () => asset })
    await view.ready

    for (const locomotion of [
      "walk",
      "walk",
      "run",
      "airborne",
      "idle",
    ] as const)
      view.update(state(locomotion), 0.1)

    expect(view.activeAnimation()).toBe("idle")
    expect(asset.root.position.y).toBeCloseTo(0.5)
    view.dispose()
  })

  it("does not attach or leak a load that completes after disposal", async () => {
    let resolve!: (asset: ReturnType<typeof fakeAsset>) => void
    const view = createTravelerView({
      load: () => new Promise((done) => (resolve = done)),
    })
    view.dispose()
    const asset = fakeAsset()
    resolve(asset)
    await view.ready
    expect(asset.dispose).toHaveBeenCalledOnce()
    expect(view.object.parent).toBeNull()
  })
})

it("settles a never-ending load to the playable fallback, aborts work and rejects late attachment", async () => {
  vi.useFakeTimers()
  let resolve!: (asset: CharacterAsset) => void
  let signal!: AbortSignal
  const onStatus = vi.fn()
  const view = createTravelerView({
    onStatus,
    load: (requestSignal) => {
      signal = requestSignal
      return new Promise((done) => {
        resolve = done
      })
    },
  })
  const ready = vi.fn()
  void view.ready.then(ready)
  await vi.advanceTimersByTimeAsync(7_999)
  expect(ready).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(ready).toHaveBeenCalledOnce()
  expect(signal.aborted).toBe(true)
  expect(onStatus).toHaveBeenLastCalledWith("fallback")
  expect(view.object.getObjectByName("TravelerFallback")).toBeDefined()
  view.update(state("walk"), 1 / 60)
  const late = fakeAsset()
  resolve(late)
  await Promise.resolve()
  expect(late.dispose).toHaveBeenCalledOnce()
  expect(view.object.getObjectByName("TravelerFallback")).toBeDefined()
  expect(onStatus).toHaveBeenCalledOnce()
  view.dispose()
  expect(vi.getTimerCount()).toBe(0)
})

it("cancels the load deadline and resolves readiness on disposal without publishing fallback", async () => {
  vi.useFakeTimers()
  const onStatus = vi.fn()
  const view = createTravelerView({
    load: () => new Promise(() => {}),
    onStatus,
  })
  const ready = vi.fn()
  void view.ready.then(ready)
  view.dispose()
  await vi.advanceTimersByTimeAsync(8_000)
  expect(ready).toHaveBeenCalledOnce()
  expect(onStatus).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it("changes Walk or Jump to the Idle pose without advancing animation time", async () => {
  const asset = fakeAsset()
  const view = createTravelerView({ load: async () => asset })
  await view.ready
  for (const locomotion of ["walk", "airborne"] as const) {
    view.update(state(locomotion), 0.5)
    expect(asset.root.position.y).toBeGreaterThan(0)
    view.update(state("idle"), 0)
    expect(view.activeAnimation()).toBe("idle")
    expect(asset.root.position.y).toBe(0)
    view.update(state("idle"), 0)
    expect(asset.root.position.y).toBe(0)
  }
  view.dispose()
})

it.each(["fetch", "body"] as const)(
  "allows explicit entry when the real loader stalls at %s",
  async (phase) => {
    vi.useFakeTimers()
    let requestSignal!: AbortSignal
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init: RequestInit) => {
        requestSignal = init.signal as AbortSignal
        return phase === "fetch"
          ? new Promise(() => {})
          : Promise.resolve({
              ok: true,
              arrayBuffer: () => new Promise(() => {}),
            })
      }),
    )
    const view = createTravelerView()
    const onState = vi.fn()
    const start = vi.fn()
    const experience = createExperience({
      canvas: document.createElement("canvas"),
      onState,
      getWebGL2Context: () => ({}) as WebGL2RenderingContext,
      createRuntime: () => ({
        ready: view.ready,
        start,
        pause: vi.fn(),
        resume: vi.fn(),
        dispose: view.dispose,
      }),
    })
    expect(experience.start()).toBe(false)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(onState).toHaveBeenLastCalledWith({ status: "ready" })
    expect(requestSignal.aborted).toBe(true)
    expect(view.object.getObjectByName("TravelerFallback")).toBeDefined()
    expect(start).not.toHaveBeenCalled()
    expect(experience.start()).toBe(true)
    experience.dispose()
    expect(vi.getTimerCount()).toBe(0)
  },
)

it("clears the deadline after timely success without aborting or replacing the loaded model", async () => {
  vi.useFakeTimers()
  let signal!: AbortSignal
  const asset = fakeAsset()
  const onStatus = vi.fn()
  const view = createTravelerView({
    onStatus,
    load: async (requestSignal) => {
      signal = requestSignal
      return asset
    },
  })
  await view.ready
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(8_000)
  expect(signal.aborted).toBe(false)
  expect(onStatus).toHaveBeenCalledExactlyOnceWith("loaded")
  expect(asset.dispose).not.toHaveBeenCalled()
  view.dispose()
})
