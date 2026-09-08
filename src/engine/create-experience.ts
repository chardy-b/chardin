import type {
  Experience,
  ExperienceRuntime,
  ExperienceState,
  RuntimeOptions,
} from "@/engine/contracts"
import type { Quality } from "@/engine/quality/quality-controller"
import { createThreeRuntime } from "@/engine/three-runtime"

interface CreateExperienceOptions {
  canvas: HTMLCanvasElement
  touchRoot?: HTMLElement | null
  onState(state: ExperienceState): void
  onQuality?: (quality: Quality) => void
  getWebGL2Context?: (
    canvas: HTMLCanvasElement,
  ) => WebGL2RenderingContext | null
  createRuntime?: (
    canvas: HTMLCanvasElement,
    context: WebGL2RenderingContext,
    options?: RuntimeOptions,
  ) => ExperienceRuntime
}

export function createExperience({
  canvas,
  touchRoot,
  onState,
  onQuality,
  getWebGL2Context = (target) => target.getContext("webgl2"),
  createRuntime = createThreeRuntime,
}: CreateExperienceOptions): Experience {
  let runtime: ExperienceRuntime | null = null
  let lifecycle: ExperienceState["status"] = "checking"
  let disposed = false
  let contextLost = false
  let generation = 0
  let quality: Quality | undefined
  const publish = (state: ExperienceState) => {
    lifecycle = state.status
    onState(state)
  }
  const release = () => {
    generation++
    const owned = runtime
    runtime = null
    // Continue lifecycle teardown even if a driver throws during disposal.
    try {
      owned?.dispose()
    } catch {
      /* Safe failure is reported by the caller. */
    }
  }
  const fail = () => {
    if (disposed) return
    release()
    publish({ status: "failed", code: "runtime" })
  }
  const pauseRuntime = () => {
    if (!runtime || lifecycle !== "running" || disposed) return
    try {
      const epoch = generation
      runtime.pause()
      if (epoch !== generation || disposed) return
      publish({ status: "paused" })
    } catch {
      fail()
    }
  }
  const construct = (recovered = false) => {
    if (disposed) return
    release()
    publish({ status: "checking" })
    try {
      const context = getWebGL2Context(canvas)
      if (!context) {
        publish({ status: "failed", code: "webgl2" })
        return
      }
      if (context.isContextLost?.()) {
        contextLost = true
        publish({ status: "context-lost" })
        return
      }
      publish({ status: "loading", progress: 0 })
      const epoch = generation
      const owned = createRuntime(canvas, context, {
        touchRoot,
        quality,
        onPauseRequested: pauseRuntime,
        onFatal: () => {
          if (epoch === generation) fail()
        },
        onQuality: (next) => {
          quality = next
          onQuality?.(next)
        },
      })
      // Construction may have reported a synchronous fatal error.
      if (epoch !== generation) {
        owned.dispose()
        return
      }
      runtime = owned
      const complete = () => {
        if (!disposed && epoch === generation)
          publish({ status: recovered ? "recovered" : "ready" })
      }
      if (owned.ready)
        void owned.ready.then(complete, () => {
          if (epoch === generation) fail()
        })
      else complete()
    } catch {
      fail()
    }
  }
  const onLost = (event: Event) => {
    event.preventDefault()
    if (disposed) return
    contextLost = true
    release()
    publish({ status: "context-lost" })
  }
  const onRestored = () => {
    if (!disposed && contextLost) {
      contextLost = false
      construct(true)
    }
  }
  canvas.addEventListener("webglcontextlost", onLost)
  canvas.addEventListener("webglcontextrestored", onRestored)
  construct()

  const start = () => {
    if (!runtime || !["ready", "recovered"].includes(lifecycle) || disposed)
      return false
    try {
      const epoch = generation
      runtime.start()
      if (epoch !== generation || disposed) return false
      publish({ status: "running" })
      return true
    } catch {
      fail()
      return false
    }
  }
  return {
    start,
    pause: pauseRuntime,
    resume() {
      if (lifecycle === "recovered") {
        start()
        return
      }
      if (!runtime || lifecycle !== "paused" || disposed) return
      try {
        const epoch = generation
        runtime.resume()
        if (epoch !== generation || disposed) return
        publish({ status: "running" })
      } catch {
        fail()
      }
    },
    retry() {
      // A lost context cannot be reconstructed. Keep listening for restoration,
      // even if Retry is pressed repeatedly while the browser is recovering.
      if (!contextLost && lifecycle === "failed") construct()
    },
    setQuality(next) {
      if (disposed) return
      quality = next
      try {
        runtime?.setQuality?.(next)
      } catch {
        fail()
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      canvas.removeEventListener("webglcontextlost", onLost)
      canvas.removeEventListener("webglcontextrestored", onRestored)
      release()
      publish({ status: "disposed" })
    },
  }
}
