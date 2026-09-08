import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js"

import {
  validateCharacterManifest,
  type CharacterAnimation,
  type CharacterManifest,
} from "@/engine/assets/manifest"

export interface CharacterAsset {
  root: THREE.Object3D
  clips: Partial<Record<CharacterAnimation, THREE.AnimationClip>> & {
    idle: THREE.AnimationClip
  }
  attachments: Record<string, THREE.Object3D>
  dispose(): void
}

export interface CharacterLoadTransport {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

const abortError = () =>
  new DOMException("Character load aborted", "AbortError")

function disposeScenes(scenes: THREE.Object3D[]) {
  const disposed = new Set<object>()
  for (const scene of scenes) {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.geometry && !disposed.has(mesh.geometry)) {
        disposed.add(mesh.geometry)
        mesh.geometry.dispose()
      }
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : []
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture && !disposed.has(value)) {
            disposed.add(value)
            value.dispose()
          }
        }
        if (!disposed.has(material)) {
          disposed.add(material)
          material.dispose()
        }
      }
      const skeleton = (object as THREE.SkinnedMesh).skeleton
      if (skeleton && !disposed.has(skeleton)) {
        disposed.add(skeleton)
        skeleton.dispose()
      }
    })
  }
}

function parseGlb(bytes: ArrayBuffer): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(bytes, "", resolve, reject)
  })
}

function assertSelfContainedGlb(bytes: ArrayBuffer) {
  const view = new DataView(bytes)
  if (
    bytes.byteLength < 20 ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2
  ) {
    throw new Error("Character model must be a binary glTF 2 file")
  }
  const jsonLength = view.getUint32(12, true)
  if (20 + jsonLength > bytes.byteLength)
    throw new Error("Character model has an invalid JSON chunk")
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)),
  ) as {
    buffers?: Array<{ uri?: string }>
    images?: Array<{ uri?: string }>
  }
  const external = [...(json.buffers ?? []), ...(json.images ?? [])].some(
    ({ uri }) => uri !== undefined && !uri.startsWith("data:"),
  )
  if (external)
    throw new Error("Character model must not reference external resources")
}

export async function loadCharacter(
  input: CharacterManifest,
  transport: CharacterLoadTransport = {
    fetch: globalThis.fetch.bind(globalThis),
  },
  signal?: AbortSignal,
): Promise<CharacterAsset> {
  const manifest = validateCharacterManifest(input)
  if (signal?.aborted) throw abortError()
  const response = await transport.fetch(manifest.modelUrl, {
    credentials: "same-origin",
    mode: "same-origin",
    signal,
  })
  if (signal?.aborted) throw abortError()
  if (!response.ok)
    throw new Error(`Character model request failed (${response.status})`)
  const bytes = await response.arrayBuffer()
  if (signal?.aborted) throw abortError()
  assertSelfContainedGlb(bytes)
  const gltf = await parseGlb(bytes)
  const scenes = gltf.scenes.length ? gltf.scenes : [gltf.scene]
  if (signal?.aborted) {
    disposeScenes(scenes)
    throw abortError()
  }
  try {
    const root = scenes
      .map((scene) => scene.getObjectByName(manifest.rootNode))
      .find(Boolean)
    if (!root)
      throw new Error(
        `Character root node "${manifest.rootNode}" was not found`,
      )
    const clips: Partial<Record<CharacterAnimation, THREE.AnimationClip>> = {}
    for (const [state, clipName] of Object.entries(manifest.animations)) {
      const clip = gltf.animations.find(
        (candidate) => candidate.name === clipName,
      )
      if (!clip)
        throw new Error(
          `Character animation "${clipName}" for ${state} was not found`,
        )
      clips[state as CharacterAnimation] = clip
    }
    const attachments: Record<string, THREE.Object3D> = {}
    for (const [name, nodeName] of Object.entries(manifest.attachments ?? {})) {
      const node = root.getObjectByName(nodeName)
      if (!node)
        throw new Error(
          `Character attachment "${nodeName}" for ${name} was not found`,
        )
      attachments[name] = node
    }
    root.scale.setScalar(manifest.scale)
    let disposed = false
    return {
      root,
      clips: clips as CharacterAsset["clips"],
      attachments,
      dispose() {
        if (disposed) return
        disposed = true
        root.removeFromParent()
        disposeScenes([...scenes, root])
      },
    }
  } catch (error) {
    disposeScenes(scenes)
    throw error
  }
}
