import { forwardRef } from "react"

export const TouchControls = forwardRef<HTMLDivElement>(
  function TouchControls(_, ref) {
    return (
      <div ref={ref} className="touch-controls" aria-label="Touch controls">
        <div className="touch-cluster touch-cluster-left">
          <div
            className="touch-stick touch-target"
            role="group"
            aria-label="Move traveler"
            data-touch-input="move"
          >
            <span aria-hidden="true">Move</span>
          </div>
          <button
            className="touch-button touch-target"
            type="button"
            data-touch-input="run"
          >
            Run
          </button>
        </div>
        <div className="touch-cluster touch-cluster-right">
          <div
            className="touch-stick touch-target"
            role="group"
            aria-label="Look around"
            data-touch-input="look"
          >
            <span aria-hidden="true">Look</span>
          </div>
          <button
            className="touch-button touch-target"
            type="button"
            data-touch-input="action"
          >
            Act
          </button>
          <button
            className="touch-button touch-target"
            type="button"
            data-touch-input="jump"
          >
            Jump
          </button>
          <button
            className="touch-button touch-target"
            type="button"
            data-touch-input="pause"
          >
            Pause
          </button>
        </div>
      </div>
    )
  },
)
