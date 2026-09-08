"use client"

import { useEffect, useRef, useState } from "react"

import type { Quality } from "@/engine/quality/quality-controller"
import type { Experience, ExperienceState } from "@/engine/contracts"
import { createExperience } from "@/engine/create-experience"
import { PavilionDescription } from "@/components/experience/pavilion-description"
import type { SkyStatus, SkyCommand } from "@/engine/world/sky-controller"
import { TouchControls } from "@/components/experience/touch-controls"

export function ChardinExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const touchRef = useRef<HTMLDivElement>(null)
  const experienceRef = useRef<Experience | null>(null)
  const [state, setState] = useState<ExperienceState>({ status: "checking" })
  const [quality, setQuality] = useState<Quality>("low")
  const [helpOpen, setHelpOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const helpRef = useRef<HTMLButtonElement>(null)
  const aboutRef = useRef<HTMLButtonElement>(null)
  const lifecycleRef = useRef<HTMLDivElement>(null)
  const [sky, setSky] = useState<SkyStatus>({
    phase: "Settle",
    playback: "ready",
    inside: false,
    viewingZone: false,
    viewing: false,
    available: false,
    scoreAvailable: true,
    reducedMotion: false,
  })
  const command = (value: SkyCommand) =>
    experienceRef.current?.skyCommand(value)
  const runtimeReady = ["running", "paused"].includes(state.status)
  const liveDisabled =
    !runtimeReady ||
    !sky.available ||
    !sky.inside ||
    !sky.scoreAvailable ||
    sky.reducedMotion
  const reason = !runtimeReady
    ? "Enter or resume the world to use pavilion controls."
    : !sky.available
      ? "The pavilion is unavailable. You can still explore the planet."
      : !sky.inside
        ? "Walk up the ramp and inside the chamber to start the light sequence."
        : sky.reducedMotion
          ? "Reduced motion is on. Choose a still view; automatic playback stays off."
          : ""
  const previousLifecycle = useRef(state.status)
  useEffect(() => {
    const changed = previousLifecycle.current !== state.status
    previousLifecycle.current = state.status
    if (
      changed &&
      ["paused", "recovered", "failed", "context-lost"].includes(
        state.status,
      ) &&
      !helpOpen &&
      !aboutOpen
    )
      lifecycleRef.current?.querySelector<HTMLButtonElement>("button")?.focus()
  }, [state.status, helpOpen, aboutOpen])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const experience = createExperience({
      canvas,
      touchRoot: touchRef.current,
      onState: setState,
      onQuality: setQuality,
      onSkyStatus: setSky,
    })
    experienceRef.current = experience
    const onVisibilityChange = () => {
      if (document.hidden) experience.pause()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      experience.dispose()
      experienceRef.current = null
    }
  }, [])

  const begin = () => {
    setHelpOpen(false)
    setAboutOpen(false)
    experienceRef.current?.start()
    canvasRef.current?.focus()
  }
  const resume = () => {
    setHelpOpen(false)
    setAboutOpen(false)
    experienceRef.current?.resume()
    canvasRef.current?.focus()
  }
  const failure = state.status === "failed" ? state.code : null
  const availability = !sky.available && (
    <p className="pavilion-availability" role="status">
      The pavilion is unavailable. You can still explore the planet.
    </p>
  )

  return (
    <main
      className="experience-shell"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || (!helpOpen && !aboutOpen)) return
        event.preventDefault()
        event.stopPropagation()
        if (helpOpen) {
          setHelpOpen(false)
          helpRef.current?.focus()
        } else {
          setAboutOpen(false)
          aboutRef.current?.focus()
        }
      }}
    >
      <canvas
        ref={canvasRef}
        className="world-canvas"
        aria-label="Chardin spherical world"
        tabIndex={0}
      />
      <TouchControls ref={touchRef} />
      <header className="brand-lockup">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <p className="brand-name">Chardin</p>
          <p className="brand-note">Meadow to sky</p>
        </div>
      </header>
      <label className="quality-control">
        <span>Visual quality</span>
        <select
          value={quality}
          onChange={(event) => {
            const next = event.target.value as Quality
            setQuality(next)
            experienceRef.current?.setQuality(next)
          }}
        >
          <option value="low">Low</option>
          <option value="balanced">Balanced</option>
          <option value="high">High</option>
        </select>
      </label>
      <nav className="experience-actions" aria-label="Experience controls">
        {state.status === "running" && (
          <button type="button" onClick={() => experienceRef.current?.pause()}>
            Pause
          </button>
        )}
        <button
          type="button"
          ref={helpRef}
          onClick={() => {
            experienceRef.current?.pause()
            setAboutOpen(false)
            setHelpOpen((open) => !open)
            helpRef.current?.focus()
          }}
          aria-expanded={helpOpen}
          aria-controls="movement-guide"
        >
          {helpOpen ? "Close guide" : "How to move"}
        </button>
        <button
          ref={aboutRef}
          type="button"
          aria-expanded={aboutOpen}
          aria-controls="pavilion-description"
          onClick={() => {
            experienceRef.current?.pause()
            setHelpOpen(false)
            setAboutOpen((open) => !open)
            aboutRef.current?.focus()
          }}
        >
          About the pavilion
        </button>
      </nav>
      <aside
        id="pavilion-description"
        className="description-panel"
        hidden={!aboutOpen}
      >
        <button
          type="button"
          onClick={() => {
            setAboutOpen(false)
            aboutRef.current?.focus()
          }}
        >
          Close description
        </button>
        <PavilionDescription />
        {state.status === "paused" && (
          <button type="button" onClick={resume}>
            Resume
          </button>
        )}
      </aside>
      <details className="sky-panel">
        <summary>Light and view</summary>
        <p>
          {!runtimeReady
            ? "Pavilion controls are available after Enter."
            : sky.available
              ? `${sky.phase} · ${sky.playback}${sky.viewing ? " · Aperture view" : ""}`
              : "The pavilion is unavailable. You can still explore the planet."}
        </p>
        <p id="pavilion-control-reason">{reason}</p>
        {!sky.scoreAvailable && (
          <p>
            The light sequence is unavailable. Neutral Still light remains
            available.
          </p>
        )}
        <div
          className="pavilion-buttons"
          aria-describedby="pavilion-control-reason"
        >
          <button
            type="button"
            disabled={liveDisabled}
            onClick={() =>
              command(
                sky.playback === "ready" || sky.playback === "complete"
                  ? "start"
                  : "continue",
              )
            }
          >
            {sky.playback === "complete"
              ? "Restart light sequence"
              : sky.playback === "ready"
                ? "Start light sequence"
                : "Continue light sequence"}
          </button>
          <button
            type="button"
            disabled={
              !runtimeReady || !sky.available || sky.playback !== "playing"
            }
            onClick={() => command("freeze")}
          >
            Freeze light sequence
          </button>
          <button
            type="button"
            disabled={!runtimeReady || !sky.available}
            onClick={() => command("still")}
          >
            Still light
          </button>
          <button
            type="button"
            disabled={!runtimeReady || !sky.available || !sky.scoreAvailable}
            onClick={() => command("previous-still")}
            onKeyDown={(e) => {
              if (e.repeat) e.preventDefault()
            }}
          >
            Previous still view
          </button>
          <button
            type="button"
            disabled={!runtimeReady || !sky.available || !sky.scoreAvailable}
            onClick={() => command("next-still")}
            onKeyDown={(e) => {
              if (e.repeat) e.preventDefault()
            }}
          >
            Next still view
          </button>
          <button
            type="button"
            disabled={
              state.status !== "running" ||
              !sky.available ||
              (!sky.viewingZone && !sky.viewing)
            }
            onClick={() => command(sky.viewing ? "leave-view" : "view")}
          >
            {sky.viewing ? "Leave view" : "View aperture"}
          </button>
        </div>
        {!sky.viewingZone && (
          <p>
            Stand on the small floor inset to view the aperture. Movement pauses
            while viewing; E or Leave view returns to walking.
          </p>
        )}
      </details>
      {helpOpen && (
        <aside
          id="movement-guide"
          className="help-panel"
          aria-label="Movement guide"
        >
          <p>Walk with W/S or ↑/↓. Turn with A/D or ←/→.</p>
          <p>Hold Shift to run. Press Space to jump and E to act.</p>
          <p>Look around with I/J/K/L.</p>
          <p>
            On touch, use the two pads and action buttons. Standard gamepads are
            supported.
          </p>
          <p>
            Find the raised room beyond the curved grass. Approach its single
            ramp, pass through the open doorway, and stand on the small floor
            inset. E views or leaves the aperture; Start light sequence is a
            separate button under Light and view.
          </p>
          <p>
            Return through the same doorway and down the ramp at any time.
            Escape pauses first. No sound plays.
          </p>
          <p>Pause whenever you need to step away.</p>
          {state.status === "paused" && (
            <button type="button" onClick={resume}>
              Resume
            </button>
          )}
        </aside>
      )}
      <div
        ref={lifecycleRef}
        className="lifecycle"
        aria-live="polite"
        hidden={state.status === "paused" && (helpOpen || aboutOpen)}
      >
        {(state.status === "checking" || state.status === "loading") && (
          <section className="pause-panel" role="status">
            <p>Preparing the world…</p>
            <progress aria-label="Preparing the world" />
          </section>
        )}
        {state.status === "ready" && (
          <section className="welcome-panel">
            <p className="eyebrow">Pavilion · 02</p>
            <h1>
              Follow the curve
              <br />
              of a quiet planet.
            </h1>
            <p>Walk the curved grass to a quiet room open to the sky.</p>
            {availability}
            <button type="button" className="enter-button" onClick={begin}>
              Enter Chardin
            </button>
          </section>
        )}
        {(state.status === "paused" || state.status === "recovered") && (
          <section className="pause-panel">
            <p className="eyebrow">The world is resting</p>
            <h2>
              {state.status === "recovered" ? "Graphics recovered" : "Paused"}
            </h2>
            {state.status === "recovered" && (
              <p>
                The world has reset to the clearing with neutral light. Resume
                when you are ready.
              </p>
            )}
            {availability}
            <div className="pause-actions">
              <button type="button" className="enter-button" onClick={resume}>
                Resume
              </button>
              {state.status === "paused" && (
                <button
                  type="button"
                  onClick={() => command("return-to-clearing")}
                >
                  Return to clearing
                </button>
              )}
              {state.status === "paused" && !sky.available && (
                <button
                  type="button"
                  onClick={() => experienceRef.current?.retry()}
                >
                  Retry pavilion
                </button>
              )}
            </div>
          </section>
        )}
        {state.status === "context-lost" && (
          <section className="failure-panel" role="alert">
            <h1>Graphics interrupted</h1>
            <p>
              Play is paused while the browser restores graphics. If it cannot
              recover, retry to rebuild the world.
            </p>
            <button
              className="enter-button"
              type="button"
              onClick={() => experienceRef.current?.retry()}
            >
              Retry
            </button>
          </section>
        )}
        {failure && (
          <section className="failure-panel" role="alert">
            <p className="eyebrow">A still view</p>
            <h1>
              {failure === "webgl2"
                ? "Chardin needs WebGL2 to open."
                : "Chardin could not open."}
            </h1>
            <p>
              {failure === "webgl2"
                ? "This browser or device cannot provide WebGL2. About the pavilion describes the full experience and offers still phases without graphics."
                : "The world stopped safely. Retry to rebuild it, then choose Enter Chardin to play."}
            </p>
            <button
              className="enter-button"
              type="button"
              onClick={() => experienceRef.current?.retry()}
            >
              Retry
            </button>{" "}
            <a href="/api/health">Check system health</a>
          </section>
        )}
      </div>
      <p className="status-line sr-only" role="status">
        <span
          className={`status-dot status-${state.status}`}
          aria-hidden="true"
        />
        <span className="sr-only">Experience status: </span>
        {state.status}
        {runtimeReady && !sky.available && (
          <span>
            {" "}
            The pavilion is unavailable. You can still explore the planet.
          </span>
        )}
        {runtimeReady && sky.available && (
          <span className="sr-only">{`Light sequence: ${sky.phase}, ${sky.playback}.${sky.viewing ? " Aperture view." : ""}`}</span>
        )}
      </p>
    </main>
  )
}
