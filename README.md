# Chardin

Chardin is an original atmospheric browser world. The current foundation opens a tiny spherical grass Planet with an original low-poly Traveler and an accessible HTML lifecycle interface around a direct Three.js runtime.

## Requirements

- Node.js 22 or newer
- pnpm 11.24.0
- A current browser with WebGL2 for the playable view

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`, choose **Enter Chardin**, then use W/S or Up/Down to walk and A/D or Left/Right to turn. Look with I/J/K/L, hold Shift to run, press Space to jump, E to act, and Escape to pause. Touch devices receive two-thumb controls with action buttons; standard gamepads use the two sticks, A/B, left-stick click, and Menu. The Pause control stops the rendering loop. When WebGL2 is unavailable, the page presents an accessible static explanation and retains the health link.

## Quality checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm test:e2e
```

The health endpoint remains available at `/api/health`.

## Architecture and provenance

- [Canonical context](docs/context.md)
- [Direct Three.js ADR](docs/adr/0001-direct-three-runtime.md)
- [Research and legal boundary](docs/research/messenger-runtime-notes.md)
- [Original asset policy](docs/original-asset-policy.md)

All visual content remains original, code-generated primitive geometry. External assets require documented redistribution rights.

The third-person traveler is reproducibly generated with `pnpm generate:traveler`. Its node names, clips, coordinate convention, scale, provenance, and license are documented in [`public/models/README.md`](public/models/README.md). The runtime validates this manifest before use and retains a visible primitive fallback during loading or after failure. A future character swap is data-only in `src/engine/assets/manifest.ts` when it preserves that contract.

## Current limits

WIL-119 adds normalized keyboard, touch, and standard-gamepad controls while preserving deterministic fixed-step movement. Simultaneous keyboard walk and turn inputs are radially normalized, so each axis is approximately 0.707 at full diagonal input rather than matching WIL-118's full-rate values on both axes. Touch joystick groups remain pointer-operated; their semantic names describe them to assistive technology, but non-pointer movement still requires a keyboard or compatible controller. The Traveler's compact procedural clips intentionally omit facial and finger animation; missing optional locomotion mappings fall back to `Idle`. Authored grass, landmarks/skyspace, postprocessing, adaptive quality, audio, analytics, and deployment to `chardin.chezchardin.com` remain deferred.
