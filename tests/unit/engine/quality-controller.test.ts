import { describe, expect, it } from "vitest"
import {
  createQualityController,
  initialQuality,
  renderingSettings,
} from "@/engine/quality/quality-controller"

describe("adaptive quality", () => {
  it("chooses conservatively from capabilities", () => {
    expect(initialQuality({ cores: 2, memory: 2, coarse: true })).toBe("low")
    expect(initialQuality({ cores: 16, memory: 16, coarse: false })).toBe(
      "balanced",
    )
    expect(initialQuality({})).toBe("low")
  })
  it("bounds DPR, targets and couples terrain and grass with reduced effects", () => {
    for (const quality of ["high", "balanced", "low"] as const) {
      const settings = renderingSettings(quality, 4, false)
      expect(settings.dpr).toBeLessThanOrEqual(2)
      expect(settings.postScale).toBeLessThanOrEqual(1)
      expect(settings.terrain).toBe(settings.grass)
      expect(renderingSettings(quality, 4, true).bloom).toBe(false)
    }
    expect(renderingSettings("low", NaN, false).dpr).toBe(1)
  })
  it("requires sustained slow frames, downgrades one tier, never upgrades", () => {
    const controller = createQualityController("high")
    for (let i = 0; i < 119; i++) controller.sample(40)
    expect(controller.current()).toBe("high")
    controller.sample(40)
    expect(controller.current()).toBe("balanced")
    for (let i = 0; i < 600; i++) controller.sample(5)
    expect(controller.current()).toBe("balanced")
    controller.select("high")
    for (let i = 0; i < 120; i++) controller.sample(1000)
    expect(controller.current()).toBe("high") // background stalls are not frame evidence
    for (let i = 0; i < 120; i++) controller.sample(40)
    expect(controller.current()).toBe("balanced")
    for (let i = 0; i < 120; i++) controller.sample(50)
    expect(controller.current()).toBe("low")
  })
})
