import type {} from "../../../src/engine/debug/test-api"

/** Bounded real motor traversal, with no pose-setting hook. Serializable in a
 * controller browser; also exercised against the real runtime in CPU tests. */
export function walkToSkyspacePoint({
  point,
  run = false,
  backward = false,
  facePoint,
}: {
  point: number
  run?: boolean
  backward?: boolean
  facePoint?: number
}) {
  const api = window.__CHARDIN_TEST__!
  const target = api.snapshot().route[point]
  if (!target) throw new Error("Pavilion route unavailable")
  const dot = (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + v * b[i]!, 0)
  const length = (a: number[]) => Math.hypot(...a)
  const normalize = (a: number[]) => {
    const l = length(a)
    return a.map((v) => v / l)
  }
  const cross = (a: number[], b: number[]) => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ]
  let steps = 0
  const trace = []
  for (; steps < 1800; steps++) {
    const state = api.snapshot()
    let delta = target.map((v, i) => v - state.position[i]!)
    const arrived = length(delta) < 0.045
    if (arrived) {
      if (facePoint === undefined) return { steps, trace, final: state }
      const facing = state.route[facePoint]
      if (!facing) throw new Error("Pavilion facing point unavailable")
      delta = facing.map((v, i) => v - state.position[i]!)
    }
    if (!state.running) throw new Error("Route paused")
    const up = state.supportUp
    const projected = delta.map((v, i) => v - dot(delta, up) * up[i]!)
    const desired = normalize(projected).map((v) => (backward ? -v : v))
    const angle = Math.atan2(
      dot(cross(state.forward, desired), up),
      dot(state.forward, desired),
    )
    const turning = Math.abs(angle) >= 0.08
    if (arrived && !turning) return { steps, trace, final: state }
    const frames = Math.max(
      1,
      Math.min(
        12,
        Math.floor(
          turning
            ? Math.abs(angle) / (1.9 / 60)
            : (length(projected) / ((run ? 3.3 : 1.65) / 60)) * 0.5,
        ),
      ),
    )
    const x = turning ? Math.max(-1, Math.min(1, -angle / (1.9 / 60))) : 0
    api.step(frames, { move: { x, y: turning ? 0 : backward ? -1 : 1 }, run })
    steps += frames - 1
    trace.push({
      position: state.position,
      supportId: state.supportId,
      localFeet: state.localFeet,
      cameraMode: state.cameraMode,
    })
  }
  throw new Error(
    `Pavilion route did not reach P${point} after ${steps} steps: ${JSON.stringify(api.snapshot().localFeet)}`,
  )
}
