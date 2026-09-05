import { describe, expect, it } from "vitest"

import { metadata } from "@/app/layout"

describe("Chardin metadata", () => {
  it("identifies the original browser world", () => {
    expect(metadata.title).toBe("Chardin")
    expect(metadata.description).toContain("original atmospheric browser world")
  })
})
