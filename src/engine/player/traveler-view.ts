import * as THREE from "three"

import {
  loadCharacter,
  type CharacterAsset,
} from "@/engine/assets/character-loader"
import {
  travelerManifest,
  type CharacterAnimation,
} from "@/engine/assets/manifest"
import type { TravelerState } from "@/engine/contracts"

export const TRAVELER_LOAD_TIMEOUT_MS = 8_000

export interface TravelerView {
  object: THREE.Group
  ready: Promise<void>
  update(state: TravelerState, fixedSeconds: number): void
  activeAnimation(): CharacterAnimation | null
  dispose(): void
}

function fallbackTraveler() {
  const group = new THREE.Group()
  group.name = "TravelerFallback"
  const coat = new THREE.MeshStandardMaterial({
    color: 0xb9573f,
    flatShading: true,
  })
  const linen = new THREE.MeshStandardMaterial({
    color: 0xe3cda7,
    flatShading: true,
  })
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.65, 5), coat)
  body.position.y = 0.36
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), linen)
  head.position.y = 0.78
  group.add(body, head)
  return group
}

function disposeFallback(group: THREE.Group) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose()
    if (Array.isArray(mesh.material))
      mesh.material.forEach((material) => material.dispose())
    else mesh.material?.dispose()
  })
}

export function createTravelerView(
  options: {
    load?: (signal: AbortSignal) => Promise<CharacterAsset>
    onStatus?: (status: "loaded" | "fallback") => void
  } = {},
): TravelerView {
  const object = new THREE.Group()
  object.name = "TravelerView"
  const fallback = fallbackTraveler()
  object.add(fallback)
  const controller = new AbortController()
  let asset: CharacterAsset | null = null
  let mixer: THREE.AnimationMixer | null = null
  let active: CharacterAnimation | null = null
  let activeAction: THREE.AnimationAction | null = null
  let disposed = false

  let settled = false
  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const settle = (status?: "loaded" | "fallback") => {
    if (settled) return
    settled = true
    clearTimeout(deadline)
    resolveReady()
    if (!disposed && status) options.onStatus?.(status)
  }
  // Readiness is independent of whether fetch, body decoding, or a transport
  // honours abort. A late model is disposed rather than replacing live fallback.
  const deadline = setTimeout(() => {
    settle("fallback")
    controller.abort()
  }, TRAVELER_LOAD_TIMEOUT_MS)
  const failedLoad = (error: unknown) => {
    if (settled || disposed) return
    console.warn("Traveler model unavailable; retaining fallback", error)
    settle("fallback")
  }
  try {
    const loading = (
      options.load ??
      ((signal) => loadCharacter(travelerManifest, undefined, signal))
    )(controller.signal)
    void loading
      .then((loaded) => {
        if (disposed || settled) {
          loaded.dispose()
          return
        }
        asset = loaded
        mixer = new THREE.AnimationMixer(loaded.root)
        object.remove(fallback)
        disposeFallback(fallback)
        object.add(loaded.root)
        settle("loaded")
      })
      .catch(failedLoad)
  } catch (error) {
    failedLoad(error)
  }

  let frozen = false
  const transition = (next: CharacterAnimation, instant: boolean) => {
    if (!asset || !mixer) return
    const resolved = asset.clips[next] ? next : "idle"
    if (active === resolved && !(instant && !frozen)) return
    const clip = asset.clips[resolved] ?? asset.clips.idle
    const action = mixer.clipAction(clip)
    if (instant) mixer.stopAllAction()
    action.reset().setEffectiveWeight(1)
    if (resolved === "jump") {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.clampWhenFinished = false
    }
    action.play()
    if (!instant && activeAction && activeAction !== action)
      activeAction.crossFadeTo(action, 0.16, true)
    activeAction = action
    active = resolved
  }

  return {
    object,
    ready,
    update(state, fixedSeconds) {
      if (disposed) return
      const instant = fixedSeconds === 0
      transition(
        state.locomotion === "airborne" ? "jump" : state.locomotion,
        instant,
      )
      frozen = instant
      mixer?.update(fixedSeconds)
    },
    activeAnimation: () => active,
    dispose() {
      if (disposed) return
      disposed = true
      // Visibility belongs to this outer owner, across fallback/model swaps.
      // Release transient camera suppression even when disposed in eye view.
      object.visible = true
      settle()
      controller.abort()
      mixer?.stopAllAction()
      asset?.dispose()
      if (!asset) disposeFallback(fallback)
      object.removeFromParent()
      object.clear()
    },
  }
}
