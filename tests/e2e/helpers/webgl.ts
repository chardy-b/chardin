/** Pass this function directly to locator.evaluateHandle: its closure stays in
 * the browser even while the engine is torn down. Extension queries may return
 * null on a lost context, so restoration must use the pre-loss handle. */
export function retainContextLossControl(canvas: HTMLCanvasElement) {
  const extension = canvas
    .getContext("webgl2")
    ?.getExtension("WEBGL_lose_context")
  if (!extension) throw new Error("WEBGL_lose_context unavailable")
  return {
    lose: () => extension.loseContext(),
    restore: () => extension.restoreContext(),
  }
}

/** Screenshot-only synchronization. Manual simulation can submit several GPU
 * frames without waiting for presentation. Never stall normal runtime frames. */
export function finishWebGLFrame(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("webgl2")
  if (!context) throw new Error("WebGL2 unavailable before capture")
  context.finish()
}
