import { afterEach, expect, it, vi } from "vitest"
import {
  deterministicMode,
  installTestApi,
  type ChardinTestApi,
} from "@/engine/debug/test-api"
afterEach(() => {
  vi.unstubAllEnvs()
  delete window.__CHARDIN_TEST__
  window.history.replaceState({}, "", "/")
})
it.each([undefined, "false", "TRUE", "1"])(
  "never exposes hooks for flag %s",
  (flag) => {
    vi.stubEnv("NEXT_PUBLIC_E2E_HOOKS", flag)
    window.history.replaceState({}, "", "/?e2e=1")
    const cleanup = installTestApi({} as ChardinTestApi)
    expect(Object.hasOwn(window, "__CHARDIN_TEST__")).toBe(false)
    expect(deterministicMode()).toBe(false)
    cleanup()
  },
)
it("exposes only explicitly enabled hooks and removes only its own generation", () => {
  vi.stubEnv("NEXT_PUBLIC_E2E_HOOKS", "true")
  window.history.replaceState({}, "", "/?e2e=1")
  const first = {} as ChardinTestApi
  const second = {} as ChardinTestApi
  const cleanupFirst = installTestApi(first)
  const cleanupSecond = installTestApi(second)
  cleanupFirst()
  expect(window.__CHARDIN_TEST__).toBe(second)
  expect(Object.isFrozen(second)).toBe(true)
  expect(deterministicMode()).toBe(true)
  cleanupSecond()
  expect(Object.hasOwn(window, "__CHARDIN_TEST__")).toBe(false)
})
