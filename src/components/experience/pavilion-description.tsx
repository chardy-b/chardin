import { useState } from "react"

const phases = [
  {
    name: "Settle",
    description: "The sky and wall rest in neutral light.",
    sky: "neutral",
    wall: "neutral",
  },
  {
    name: "Warm surround",
    description: "The wall warms while the sky stays the same.",
    sky: "neutral",
    wall: "warm",
  },
  {
    name: "Open blue",
    description: "The sky becomes bluer while the warm wall holds.",
    sky: "blue",
    wall: "warm",
  },
  {
    name: "Cool surround",
    description: "The wall cools while the blue sky holds.",
    sky: "blue",
    wall: "cool",
  },
  {
    name: "Return",
    description:
      "The sky and wall return to neutral. The sequence rests until you restart it.",
    sky: "neutral",
    wall: "neutral",
  },
] as const

/** SSR-readable content; the selector owns HTML state only and imports no engine. */
export function PavilionDescription() {
  const [index, setIndex] = useState(0)
  const phase = phases[index]!
  return (
    <section aria-label="About the pavilion">
      <h2>About the pavilion</h2>
      <p>
        A small level room sits above the curved grass. Walk up the ramp and
        through the open doorway. A slanted opening in the roof frames the sky.
        The surrounding wall warms, the sky becomes bluer, and both return to a
        quiet neutral. You can leave through the same doorway at any time.
      </p>
      <p>
        The silent, three-minute light sequence starts only when you choose.
        Leaving freezes it; choose Continue on return. You can pause, use Still
        light, or inspect these five still phases without entering the world.
      </p>
      <div className={`pavilion-swatch wall-${phase.wall}`} aria-hidden="true">
        <span className={`sky-${phase.sky}`} />
      </div>
      <div aria-live="polite" aria-atomic="true">
        <h3>{phase.name}</h3>
        <p>{phase.description}</p>
      </div>
      <div
        className="pavilion-buttons"
        role="group"
        aria-label="HTML still phases"
      >
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          onKeyDown={(e) => {
            if (e.repeat) e.preventDefault()
          }}
        >
          Previous still phase
        </button>
        <button
          type="button"
          disabled={index === 4}
          onClick={() => setIndex((i) => Math.min(4, i + 1))}
          onKeyDown={(e) => {
            if (e.repeat) e.preventDefault()
          }}
        >
          Next still phase
        </button>
      </div>
      <ol>
        {phases.map((p) => (
          <li key={p.name}>
            <strong>{p.name}.</strong> {p.description}
          </li>
        ))}
      </ol>
      <p>
        Exploration uses keyboard, touch, or a gamepad. This description and
        still selector provide the complete light sequence without precise
        movement, color discrimination, or graphics support.
      </p>
    </section>
  )
}
