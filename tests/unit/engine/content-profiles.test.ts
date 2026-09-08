import { expect, it, vi } from "vitest"
import { createContentProfiles } from "@/engine/world/content-profiles"
it("prepares coupled terrain/grass once and switches without generation or changing motor radius", () => {
  const profiles = createContentProfiles()
  const high = profiles.get("high")
  const low = profiles.get("low")
  expect(high.planet.profile.grassCount).toBe(high.grass.mesh.count)
  expect(low.planet.profile.grassCount).toBe(low.grass.mesh.count)
  expect(profiles.get("high")).toBe(high)
  const dispose = vi.spyOn(high.planet, "dispose")
  profiles.dispose()
  profiles.dispose()
  expect(dispose).toHaveBeenCalledOnce()
})
