export type CharacterAnimation = "idle" | "walk" | "run" | "jump"

export interface CharacterManifest {
  modelUrl: string
  scale: number
  rootNode: string
  animations: Partial<Record<CharacterAnimation, string>> & { idle: string }
  attachments?: Record<string, string>
}

const animationNames: CharacterAnimation[] = ["idle", "walk", "run", "jump"]
const manifestUrlBase = "https://chardin.invalid"

function named(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Character manifest ${field} must be a non-empty string`)
  }
}

export function validateCharacterManifest(value: unknown): CharacterManifest {
  if (!value || typeof value !== "object") {
    throw new Error("Character manifest must be an object")
  }
  const manifest = value as Record<string, unknown>
  named(manifest.modelUrl, "modelUrl")
  let resolvedModelUrl: URL
  try {
    resolvedModelUrl = new URL(manifest.modelUrl, manifestUrlBase)
  } catch {
    throw new Error(
      "Character manifest modelUrl must be a same-origin absolute path",
    )
  }
  if (
    !manifest.modelUrl.startsWith("/") ||
    /[\\\u0000-\u001f\u007f]/.test(manifest.modelUrl) ||
    resolvedModelUrl.origin !== manifestUrlBase
  ) {
    throw new Error(
      "Character manifest modelUrl must be a same-origin absolute path",
    )
  }
  if (
    !Number.isFinite(manifest.scale) ||
    Number(manifest.scale) <= 0 ||
    Number(manifest.scale) > 10
  ) {
    throw new Error(
      "Character manifest scale must be positive, finite, and at most 10",
    )
  }
  named(manifest.rootNode, "rootNode")
  if (!manifest.animations || typeof manifest.animations !== "object") {
    throw new Error("Character manifest animations must be an object")
  }
  const animations = manifest.animations as Record<string, unknown>
  named(animations.idle, "animations.idle")
  for (const name of animationNames) {
    if (animations[name] !== undefined)
      named(animations[name], `animations.${name}`)
  }
  if (manifest.attachments !== undefined) {
    if (
      !manifest.attachments ||
      typeof manifest.attachments !== "object" ||
      Array.isArray(manifest.attachments)
    ) {
      throw new Error("Character manifest attachments must be an object")
    }
    for (const [key, target] of Object.entries(manifest.attachments)) {
      named(key, "attachments key")
      named(target, `attachments.${key}`)
    }
  }
  return value as CharacterManifest
}

export const travelerManifest = validateCharacterManifest({
  modelUrl: "/models/traveler.glb",
  scale: 1,
  rootNode: "Traveler",
  animations: { idle: "Idle", walk: "Walk", run: "Run", jump: "Jump" },
  attachments: {
    cameraFocus: "Head",
    leftHand: "LeftHand",
    rightHand: "RightHand",
    leftFoot: "LeftAnkle",
    rightFoot: "RightAnkle",
  },
})

/** Fixed, original procedural content. No URL or arbitrary geometry input. */
export const landmarkDefinition = Object.freeze({
  id: "skyspace-pavilion-v1",
  generatorId: "chardin-radial-pavilion-v1",
  provenanceId: "wil125-original-pavilion",
  dimensionsVersion: 1,
  scoreVersion: 1,
  radius: 5,
  groundRadius: 5.03,
  heading: 0,
  clearingAngle: 0.75,
  direction: Object.freeze([0.72, 0.38, 0.58]),
  aperture: Object.freeze(
    [
      [-0.55, -0.75],
      [0.65, -0.55],
      [0.5, 0.4],
      [-0.35, 0.4],
    ].map((p) => Object.freeze(p)),
  ),
})
export type LandmarkDefinition = typeof landmarkDefinition
export function validateLandmarkDefinition(value: unknown): LandmarkDefinition {
  // Versioned authoring contract: reject extra fields as well as altered/nonfinite
  // dimensions. This scope intentionally does not accept arbitrary level data.
  if (!value || typeof value !== "object")
    throw new Error("Invalid pavilion definition")
  const candidate = value as Record<string, unknown>
  const keys = Object.keys(landmarkDefinition)
  if (
    Object.keys(candidate).length !== keys.length ||
    keys.some(
      (key) =>
        JSON.stringify(candidate[key]) !==
        JSON.stringify(landmarkDefinition[key as keyof LandmarkDefinition]),
    )
  )
    throw new Error("Invalid pavilion definition")
  return landmarkDefinition
}
