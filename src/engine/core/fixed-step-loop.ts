export interface FixedStepLoop {
  start(): void
  pause(): void
  resume(): void
  dispose(): void
}

interface FixedStepLoopOptions {
  fixedSeconds: number
  maxFrameSeconds: number
  maxSubSteps?: number
  simulate(dt: number): void
  render(alpha: number): void
  beforeFrame?(): void
  now(): number
  requestFrame(callback: FrameRequestCallback): number
  cancelFrame(id: number): void
}

export function createFixedStepLoop({
  fixedSeconds,
  maxFrameSeconds,
  maxSubSteps = Math.ceil(maxFrameSeconds / fixedSeconds),
  simulate,
  render,
  beforeFrame,
  now,
  requestFrame,
  cancelFrame,
}: FixedStepLoopOptions): FixedStepLoop {
  let accumulator = 0
  let previousSeconds = 0
  let frameId: number | null = null
  let disposed = false
  let paused = true

  const frame = () => {
    frameId = null
    if (disposed || paused) return
    beforeFrame?.()
    const currentSeconds = now() / 1000
    const frameSeconds = Math.min(
      Math.max(currentSeconds - previousSeconds, 0),
      maxFrameSeconds,
    )
    previousSeconds = currentSeconds
    accumulator += frameSeconds

    let subSteps = 0
    const stepTolerance = fixedSeconds * 1e-9
    while (
      accumulator + stepTolerance >= fixedSeconds &&
      subSteps < maxSubSteps
    ) {
      simulate(fixedSeconds)
      if (paused || disposed) return
      accumulator = Math.max(accumulator - fixedSeconds, 0)
      subSteps += 1
    }
    if (subSteps === maxSubSteps && accumulator >= fixedSeconds) {
      accumulator %= fixedSeconds
    }
    render(
      Math.min(Math.max(accumulator / fixedSeconds, 0), 1 - Number.EPSILON),
    )
    if (!disposed && !paused) frameId = requestFrame(frame)
  }

  const schedule = () => {
    if (disposed || frameId !== null) return
    paused = false
    previousSeconds = now() / 1000
    frameId = requestFrame(frame)
  }

  const pause = () => {
    paused = true
    if (frameId !== null) cancelFrame(frameId)
    frameId = null
    accumulator = 0
    previousSeconds = 0
  }

  return {
    start: schedule,
    pause,
    resume: schedule,
    dispose() {
      if (disposed) return
      disposed = true
      pause()
    },
  }
}
