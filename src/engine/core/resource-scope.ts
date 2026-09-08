/** Own every successful allocation immediately, including partial construction. */
export function createResourceScope() {
  const cleanups: Array<() => void> = []
  let disposed = false
  return {
    defer(cleanup: () => void) {
      cleanups.push(cleanup)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup()
        } catch {
          /* One failed driver cleanup must not leak the remaining owners. */
        }
      }
      cleanups.length = 0
    },
  }
}
