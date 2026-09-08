import { createResourceScope } from "@/engine/core/resource-scope"
import {
  type Quality,
  renderingSettings,
} from "@/engine/quality/quality-controller"
import { createGrass } from "@/engine/world/grass"
import { createPlanet } from "@/engine/world/planet"

/** Prepare bounded CPU content during loading, never in a running frame. The
 * smooth spherical motor collider deliberately remains independent of visual LOD. */
export function createContentProfiles() {
  const scope = createResourceScope()
  const profiles = new Map<
    Quality,
    {
      planet: ReturnType<typeof createPlanet>
      grass: ReturnType<typeof createGrass>
    }
  >()
  try {
    for (const quality of ["low", "balanced", "high"] as const) {
      const settings = renderingSettings(quality, 1, false)
      const planet = createPlanet({ profile: settings.terrain })
      scope.defer(() => planet.dispose())
      const grass = createGrass({ profile: settings.grass })
      scope.defer(() => grass.dispose())
      profiles.set(quality, { planet, grass })
    }
    return {
      get: (quality: Quality) => profiles.get(quality)!,
      dispose: scope.dispose,
    }
  } catch (error) {
    scope.dispose()
    throw error
  }
}
