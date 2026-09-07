"use client"

import { useEffect, useRef, useState } from "react"

import type { Experience, ExperienceState } from "@/engine/contracts"
import { createExperience } from "@/engine/create-experience"
import { TouchControls } from "@/components/experience/touch-controls"

export function ChardinExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const touchRef = useRef<HTMLDivElement>(null)
  const experienceRef = useRef<Experience | null>(null)
  const [state, setState] = useState<ExperienceState>({ status: "checking" })
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const experience = createExperience({
      canvas,
      touchRoot: touchRef.current,
      onState: setState,
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
    experienceRef.current?.start()
    canvasRef.current?.focus()
  }
  const resume = () => {
    experienceRef.current?.resume()
    canvasRef.current?.focus()
  }
  const failure = state.status === "failed" ? state.code : null

  return (
    <main className="experience-shell">
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
          <p className="brand-note">A small world, still becoming</p>
        </div>
      </header>
      <div className="experience-actions" aria-label="Experience controls">
        {state.status === "running" && (
          <button type="button" onClick={() => experienceRef.current?.pause()}>
            Pause
          </button>
        )}
        <button
          type="button"
          onClick={() => setHelpOpen((open) => !open)}
          aria-expanded={helpOpen}
        >
          {helpOpen ? "Close guide" : "How to move"}
        </button>
      </div>
      {helpOpen && (
        <aside className="help-panel" aria-label="Movement guide">
          <p>Walk with W/S or ↑/↓. Turn with A/D or ←/→.</p>
          <p>Hold Shift to run. Press Space to jump and E to act.</p>
          <p>Look around with I/J/K/L.</p>
          <p>
            On touch, use the two pads and action buttons. Standard gamepads are
            supported.
          </p>
          <p>Pause whenever you need to step away.</p>
        </aside>
      )}
      <div className="lifecycle" aria-live="polite">
        {(state.status === "checking" || state.status === "loading") && (
          <p>Preparing the world…</p>
        )}
        {state.status === "ready" && (
          <section className="welcome-panel">
            <p className="eyebrow">World foundation · 01</p>
            <h1>
              Follow the curve
              <br />
              of a quiet planet.
            </h1>
            <p>This first clearing is yours to wander.</p>
            <button type="button" className="enter-button" onClick={begin}>
              Enter Chardin
            </button>
          </section>
        )}
        {state.status === "paused" && (
          <section className="pause-panel">
            <p className="eyebrow">The world is resting</p>
            <h2>Paused</h2>
            <div className="pause-actions">
              <button type="button" className="enter-button" onClick={resume}>
                Resume
              </button>
            </div>
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
                ? "This browser or device cannot provide WebGL2. You can still read about the project and check system health."
                : "The world could not start safely. Reload the page to try again."}
            </p>
            <a href="/api/health">Check system health</a>
          </section>
        )}
      </div>
      <p className="status-line">
        <span
          className={`status-dot status-${state.status}`}
          aria-hidden="true"
        />
        <span className="sr-only">Experience status: </span>
        {state.status}
      </p>
    </main>
  )
}
