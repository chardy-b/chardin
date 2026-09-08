import type { PlanetProfile } from "@/engine/world/planet"

export type Quality = "high" | "balanced" | "low"
const PROFILES = {
  high: {
    dpr: 2,
    content: "high",
    shadowSize: 1024,
    postScale: 1,
    bloom: true,
    smaa: true,
  },
  balanced: {
    dpr: 1.5,
    content: "medium",
    shadowSize: 512,
    postScale: 0.85,
    bloom: true,
    smaa: true,
  },
  low: {
    dpr: 1,
    content: "low",
    shadowSize: 256,
    postScale: 0.7,
    bloom: false,
    smaa: false,
  },
} as const

export function initialQuality({
  cores = 0,
  memory = 0,
  coarse = true,
}: {
  cores?: number
  memory?: number
  coarse?: boolean
}): Quality {
  return !coarse && cores >= 4 && memory >= 4 ? "balanced" : "low"
}

export function renderingSettings(
  quality: Quality,
  deviceDpr: number,
  reducedMotion: boolean,
) {
  const profile = PROFILES[quality]
  return {
    ...profile,
    dpr: Math.min(
      Number.isFinite(deviceDpr) ? Math.max(1, deviceDpr) : 1,
      profile.dpr,
    ),
    terrain: profile.content as PlanetProfile,
    grass: profile.content as PlanetProfile,
    bloom: profile.bloom && !reducedMotion,
  }
}

export function createQualityController(initial: Quality) {
  let quality = initial
  const samples: number[] = []
  return {
    current: () => quality,
    select(next: Quality) {
      quality = next
      samples.length = 0
    },
    sample(milliseconds: number): Quality {
      if (
        !Number.isFinite(milliseconds) ||
        milliseconds <= 0 ||
        milliseconds > 250
      )
        return quality
      samples.push(milliseconds)
      if (samples.length < 120) return quality
      const slow = samples.filter(
        (value) => value > (quality === "high" ? 22 : 34),
      ).length
      if (slow >= 90) quality = quality === "high" ? "balanced" : "low"
      samples.length = 0
      return quality
    },
  }
}
