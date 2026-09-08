import type {
  Experience,
  ExperienceRuntime,
  ExperienceState,
} from "@/engine/contracts"
import { createThreeRuntime } from "@/engine/three-runtime"

interface CreateExperienceOptions {
  canvas: HTMLCanvasElement
  touchRoot?: HTMLElement | null
  onState(state: ExperienceState): void
  getWebGL2Context?: (
    canvas: HTMLCanvasElement,
  ) => WebGL2RenderingContext | null
  createRuntime?: (
    canvas: HTMLCanvasElement,
    context: WebGL2RenderingContext,
    options?: { touchRoot?: HTMLElement | null; onPauseRequested?: () => void },
  ) => ExperienceRuntime
}

export function createExperience({
  canvas,
  touchRoot,
  onState,
  getWebGL2Context = (target) => target.getContext("webgl2"),
  createRuntime = createThreeRuntime,
}: CreateExperienceOptions): Experience {
  let runtime: ExperienceRuntime | null = null
  let lifecycle: ExperienceState["status"] = "checking"
  let disposed = false

  const publish = (state: ExperienceState) => {
    lifecycle = state.status
    onState(state)
  }
  const pauseRuntime = () => {
    if (!runtime || lifecycle !== "running" || disposed) return
    runtime.pause()
    publish({ status: "paused" })
  }

  publish({ status: "checking" })
  const context = getWebGL2Context(canvas)
  if (!context) {
    publish({ status: "failed", code: "webgl2" })
  } else {
    publish({ status: "loading", progress: 0 })
    try {
      runtime = createRuntime(canvas, context, {
        touchRoot,
        onPauseRequested: pauseRuntime,
      })
      publish({ status: "ready" })
    } catch {
      runtime = null
      publish({ status: "failed", code: "runtime" })
    }
  }

  const experience: Experience = {
    start() {
      if (!runtime || lifecycle !== "ready" || disposed) return false
      runtime.start()
      publish({ status: "running" })
      return true
    },
    pause() {
      pauseRuntime()
    },
    resume() {
      if (!runtime || lifecycle !== "paused" || disposed) return
      runtime.resume()
      publish({ status: "running" })
    },
    dispose() {
      if (disposed) return
      disposed = true
      runtime?.dispose()
      runtime = null
      publish({ status: "disposed" })
    },
  }
  return experience
}
