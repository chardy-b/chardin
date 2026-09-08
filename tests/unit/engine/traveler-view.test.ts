import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"

import type { TravelerState } from "@/engine/contracts"
import type { CharacterAsset } from "@/engine/assets/character-loader"
import { createTravelerView } from "@/engine/player/traveler-view"

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
