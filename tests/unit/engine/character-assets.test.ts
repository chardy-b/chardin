import * as THREE from "three"
import { readFile } from "node:fs/promises"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"
import { describe, expect, it, vi } from "vitest"

import {
  loadCharacter,
  type CharacterLoadTransport,
} from "@/engine/assets/character-loader"
import {
  validateCharacterManifest,
  type CharacterManifest,
} from "@/engine/assets/manifest"

const manifest: CharacterManifest = {
  modelUrl: "/models/traveler.glb",
  scale: 1,
  rootNode: "Traveler",
  animations: { idle: "Idle", walk: "Walk", run: "Run", jump: "Jump" },
  attachments: { cameraFocus: "Head" },
}

async function fixture(): Promise<ArrayBuffer> {
  const root = new THREE.Group()
  root.name = "Traveler"
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  )
  head.name = "Head"
  root.add(head)
  const clips = ["Idle", "Walk", "Run", "Jump"].map(
    (name) => new THREE.AnimationClip(name, 1, []),
  )
  const result = await new GLTFExporter().parseAsync(root, {
    binary: true,
    animations: clips,
  })
  return result as ArrayBuffer
}

describe("character manifest", () => {
  it("accepts the shipped same-origin contract", () => {
    expect(validateCharacterManifest(manifest)).toEqual(manifest)
  })

  it.each([
    "/\\evil.example/model.glb",
    "/\t\\evil.example/model.glb",
    "/\n\\evil.example/model.glb",
    "/\r\\evil.example/model.glb",
  ])("rejects authority and control-character URL variants: %j", (modelUrl) => {
    expect(() => validateCharacterManifest({ ...manifest, modelUrl })).toThrow(
      "modelUrl",
    )
  })

  it.each(["models/traveler.glb", "//example.com/model.glb", "/model.glb\0"])(
    "rejects malformed model paths: %j",
    (modelUrl) => {
      expect(() =>
        validateCharacterManifest({ ...manifest, modelUrl }),
      ).toThrow("modelUrl")
    },
  )

  it.each([
    [{ ...manifest, modelUrl: "https://example.com/model.glb" }, "modelUrl"],
    [{ ...manifest, scale: 0 }, "scale"],
    [{ ...manifest, rootNode: "" }, "rootNode"],
    [{ ...manifest, animations: { ...manifest.animations, run: "" } }, "run"],
    [{ ...manifest, attachments: { hand: "" } }, "attachments"],
  ])("rejects an unsafe or malformed contract", (value, part) => {
    expect(() => validateCharacterManifest(value)).toThrow(part)
  })
})

describe("character loader", () => {
  it("fetches a valid local path in same-origin mode", async () => {
    const bytes = await fixture()
    const fetch = vi.fn(async () => new Response(bytes))
    const asset = await loadCharacter(manifest, { fetch })
    expect(fetch).toHaveBeenCalledWith(
      "/models/traveler.glb",
      expect.objectContaining({
        credentials: "same-origin",
        mode: "same-origin",
      }),
    )
    asset.dispose()
  })

  it("loads the generated model with functioning idle, run, and jump tracks", async () => {
    const bytes = await readFile("public/models/traveler.glb")
    const asset = await loadCharacter(manifest, {
      fetch: async () => new Response(bytes),
    })
    for (const name of ["idle", "run", "jump"] as const) {
      expect(asset.clips[name]?.tracks.length).toBeGreaterThan(0)
    }
    const mixer = new THREE.AnimationMixer(asset.root)
    const arm = asset.root.getObjectByName("LeftArm")!
    const before = arm.quaternion.clone()
    mixer.clipAction(asset.clips.run!).play()
    mixer.update(0.25)
    expect(arm.quaternion.equals(before)).toBe(false)
    asset.dispose()
  })

  it("parses a real binary glTF and resolves mapped nodes and clips", async () => {
    const bytes = await fixture()
    const asset = await loadCharacter(manifest, {
      fetch: async () => new Response(bytes),
    })
    expect(asset.root.name).toBe("Traveler")
    expect(asset.clips.run?.name).toBe("Run")
    expect(asset.attachments.cameraFocus.name).toBe("Head")
    asset.dispose()
    asset.dispose()
  })

  it("allows omitted optional animation mappings", async () => {
    const bytes = await fixture()
    const asset = await loadCharacter(
      { ...manifest, animations: { idle: "Idle" } },
      { fetch: async () => new Response(bytes) },
    )
    expect(asset.clips).toEqual({
      idle: expect.objectContaining({ name: "Idle" }),
    })
    asset.dispose()
  })

  it("rejects failed URLs and missing targets", async () => {
    await expect(
      loadCharacter(manifest, {
        fetch: async () => new Response(null, { status: 404 }),
      }),
    ).rejects.toThrow("404")
    const bytes = await fixture()
    await expect(
      loadCharacter(
        { ...manifest, rootNode: "Absent" },
        { fetch: async () => new Response(bytes) },
      ),
    ).rejects.toThrow("Absent")
  })

  it("aborts without parsing a late response", async () => {
    let resolve!: (response: Response) => void
    const transport: CharacterLoadTransport = {
      fetch: vi.fn(() => new Promise<Response>((done) => (resolve = done))),
    }
    const controller = new AbortController()
    const loading = loadCharacter(manifest, transport, controller.signal)
    controller.abort()
    resolve(new Response(await fixture()))
    await expect(loading).rejects.toMatchObject({ name: "AbortError" })
  })

  it("disposes shared resources exactly once", async () => {
    const bytes = await fixture()
    const asset = await loadCharacter(manifest, {
      fetch: async () => new Response(bytes),
    })
    const mesh = asset.root.getObjectByName("Head") as THREE.Mesh
    const geometry = vi.spyOn(mesh.geometry, "dispose")
    const material = vi.spyOn(mesh.material as THREE.Material, "dispose")
    asset.dispose()
    asset.dispose()
    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
  })
})
