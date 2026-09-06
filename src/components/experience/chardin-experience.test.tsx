import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ExperienceState } from "@/engine/contracts"

const controls = {
  start: vi.fn(() => true),
  pause: vi.fn(),
  resume: vi.fn(),
  dispose: vi.fn(),
}
let publishState: (state: ExperienceState) => void

vi.mock("@/engine/create-experience", () => ({
  createExperience: ({
    onState,
  }: {
    onState(state: ExperienceState): void
  }) => {
    publishState = onState
    onState({ status: "ready" })
    return controls
  },
}))

import { ChardinExperience } from "@/components/experience/chardin-experience"

describe("ChardinExperience", () => {
  beforeEach(() => vi.clearAllMocks())

  it("presents an accessible start gesture and movement guide", async () => {
    const user = userEvent.setup()
    render(<ChardinExperience />)

    expect(screen.getByLabelText("Chardin spherical world")).toBeInTheDocument()
    await user.click(
      screen
        .getByLabelText("Experience controls")
        .querySelector("button") as HTMLButtonElement,
    )
    expect(screen.getByLabelText("Movement guide")).toHaveTextContent("W/S")
    expect(screen.getByLabelText("Movement guide")).toHaveTextContent(
      "Shift to run",
    )
    expect(screen.getByLabelText("Movement guide")).toHaveTextContent(
      "Space to jump",
    )
    await user.click(screen.getByRole("button", { name: "Enter Chardin" }))
    expect(controls.start).toHaveBeenCalledOnce()
  })

  it("disposes its owned experience on unmount", () => {
    const view = render(<ChardinExperience />)
    view.unmount()
    expect(controls.dispose).toHaveBeenCalledOnce()
  })

  it("offers resume and movement help from the paused panel", async () => {
    const user = userEvent.setup()
    render(<ChardinExperience />)
    act(() => publishState({ status: "paused" }))

    await user.click(screen.getByRole("button", { name: "Resume" }))
    expect(controls.resume).toHaveBeenCalledOnce()
    await user.click(screen.getByRole("button", { name: "How to move" }))
    expect(screen.getByLabelText("Movement guide")).toBeInTheDocument()
  })
})
