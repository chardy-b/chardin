// Fixed before collection; no environment overrides or timing-driven adaptation.
export const PERFORMANCE_WORKLOAD = Object.freeze({
  warmupFrames: 60,
  sampleFrames: 300,
})

export const PERFORMANCE_TIMEOUTS = Object.freeze({
  samplingMs: Object.freeze({
    "desktop-high": 300_000,
    "mobile-emulation-low": 120_000,
  }),
  testOverheadMs: 30_000,
  webServerMs: 180_000,
  globalMs: 720_000,
  runnerMs: 780_000,
})
