import * as THREE from "three"

import {
  loadCharacter,
  type CharacterAsset,
} from "@/engine/assets/character-loader"
import {
  travelerManifest,
  type CharacterAnimation,
} from "@/engine/assets/manifest"
import { createToonMaterial } from "@/engine/render/toon-material"
import type { TravelerState } from "@/engine/contracts"

export const TRAVELER_LOAD_TIMEOUT_MS = 8_000

export interface TravelerView {
  object: THREE.Group
  ready: Promise<void>
  update(state: TravelerState, fixedSeconds: number, signedSpeed?: number): void
  present(alpha: number): void
  animationState(): {
    clip: CharacterAnimation | null
    phase: number
    timeScale: number
  }

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
  const poses: Array<{
    node: THREE.Object3D
    previous: { p: THREE.Vector3; q: THREE.Quaternion }
    current: { p: THREE.Vector3; q: THREE.Quaternion }
  }> = []
  const originalMaterials = new Map<
    THREE.Mesh,
    THREE.Material | THREE.Material[]
  >()
  const toonMaterials = new Map<THREE.Material, THREE.MeshToonMaterial>()
  let travelerRamp: THREE.Texture | null = null
  const restore = () => {
    for (const { node, current } of poses) {
      node.position.copy(current.p)
      node.quaternion.copy(current.q)
    }
  }

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
        loaded.root.traverse((node) => {
          poses.push({
            node,
            previous: { p: node.position.clone(), q: node.quaternion.clone() },
            current: { p: node.position.clone(), q: node.quaternion.clone() },
          })
          if (node instanceof THREE.Mesh) {
            originalMaterials.set(node, node.material)
            const convert = (original: THREE.Material) => {
              let material = toonMaterials.get(original)
              if (!material) {
                material = createToonMaterial({
                  gradientMap: travelerRamp,
                  color: (original as THREE.MeshStandardMaterial).color,
                  emissiveIntensity: 0,
                  name: original.name,
                })
                travelerRamp ??= material.gradientMap
                toonMaterials.set(original, material)
              }
              return material
            }
            node.material = Array.isArray(node.material)
              ? node.material.map(convert)
              : convert(node.material)
          }
        })
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
    const preservePhase =
      (active === "walk" || active === "run") &&
      (resolved === "walk" || resolved === "run") &&
      activeAction
        ? activeAction.time / activeAction.getClip().duration
        : 0
    action.reset().setEffectiveWeight(1)
    action.time = preservePhase * clip.duration
    if (resolved === "jump") {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.clampWhenFinished = false
    }
    action.play()
    if (!instant && activeAction && activeAction !== action)
      activeAction.crossFadeTo(action, 0.12, false)
    activeAction = action
    active = resolved
  }

  return {
    object,
    ready,
    update(state, fixedSeconds, signedSpeed) {
      if (disposed || !Number.isFinite(fixedSeconds) || fixedSeconds < 0) return
      restore()
      for (const { previous, current } of poses) {
        previous.p.copy(current.p)
        previous.q.copy(current.q)
      }
      const instant = fixedSeconds === 0
      transition(
        state.locomotion === "airborne" ? "jump" : state.locomotion,
        instant,
      )
      frozen = instant
      if (activeAction && (active === "walk" || active === "run")) {
        const reference = active === "walk" ? 1.65 : 3.3
        activeAction.setEffectiveTimeScale(
          signedSpeed === undefined
            ? 1
            : Number.isFinite(signedSpeed)
              ? THREE.MathUtils.clamp(signedSpeed / reference, -2, 2)
              : 0,
        )
      }
      mixer?.update(fixedSeconds)
      for (const { node, current, previous } of poses) {
        current.p.copy(node.position)
        current.q.copy(node.quaternion)
        if (instant) {
          previous.p.copy(current.p)
          previous.q.copy(current.q)
        }
      }
    },
    present(alpha) {
      if (disposed) return
      const t = frozen
        ? 1
        : Number.isFinite(alpha)
          ? THREE.MathUtils.clamp(alpha, 0, 1)
          : 1
      for (const { node, previous, current } of poses) {
        node.position.lerpVectors(previous.p, current.p, t)
        node.quaternion.slerpQuaternions(previous.q, current.q, t)
      }
    },
    animationState: () => ({
      clip: active,
      phase: activeAction
        ? activeAction.time / activeAction.getClip().duration
        : 0,
      timeScale: activeAction?.getEffectiveTimeScale() ?? 0,
    }),
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
      mixer?.uncacheRoot(asset!.root)
      for (const [mesh, original] of originalMaterials) mesh.material = original
      originalMaterials.clear()
      asset?.dispose()
      for (const material of toonMaterials.values()) material.dispose()
      toonMaterials.clear()
      poses.length = 0
      if (!asset) disposeFallback(fallback)
      object.removeFromParent()
      object.clear()
    },
  }
}
