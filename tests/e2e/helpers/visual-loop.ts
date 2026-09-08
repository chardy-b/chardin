import type { TestSnapshot } from "../../../src/engine/debug/test-api"

/** Controller-owned capture identity. Git identity is supplied by the controller,
 * never a hardcoded runtime revision or a production debug environment variable. */
export function visualLoopMetadata(
  state: TestSnapshot,
  source: { commit: string; dirty: boolean; diffSha256: string },
) {
  if (
    !/^[a-f0-9]{40}$/.test(source.commit) ||
    !/^[a-f0-9]{64}$/.test(source.diffSha256)
  )
    throw new Error("Exact commit and worktree diff SHA-256 are required")
  return {
    schema: 1,
    source: { ...source },
    viewport: { ...state.viewport },
    quality: state.quality,
    deviceDpr: state.deviceDpr,
    reducedMotion: state.reducedMotion,
    light: { ...state.sky },
    player: {
      position: [...state.position],
      forward: [...state.forward],
      supportId: state.supportId,
      supportUp: [...state.supportUp],
      grounded: state.grounded,
    },
    camera: {
      position: [...state.cameraPosition],
      target: [...state.cameraTarget],
      up: [...state.cameraUp],
      yaw: state.cameraYaw,
      pitch: state.cameraPitch,
      fov: state.cameraFov,
      mode: state.cameraMode,
    },
    presentation: {
      ...state.presentation,
      position: [...state.presentation.position],
      cameraPosition: [...state.presentation.cameraPosition],
      cameraTarget: [...state.presentation.cameraTarget],
    },
    animation: { ...state.animation },
    movement: { ...state.movement, move: { ...state.movement.move } },
    simulationTime: state.simulationTime,
    generation: state.generation,
  }
}

/** Call in a fresh, ready and explicitly entered manual runtime. Advance the
 * real motor to nearby meadow with a separated run contact at phase ~0.12.
 * No teleport, forced pose, hidden controls, or production mutation seam. */
export function prepareCharacterFrame() {
  const api = window.__CHARDIN_TEST__!
  if (api.snapshot().simulationTime !== 0)
    throw new Error("Fresh runtime required")
  api.step(35, { move: { x: 0, y: 1 }, run: true })
  api.present(1)
  const state = api.snapshot()
  if (
    state.animation.clip !== "run" ||
    state.animation.phase < 0.08 ||
    state.animation.phase > 0.18
  )
    throw new Error("Expected a non-neutral run contact")
  return state
}
