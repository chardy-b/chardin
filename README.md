# Chardin

Chardin is an original atmospheric browser world. The current foundation opens a tiny spherical grass Planet with a geometric placeholder Traveler and an accessible HTML lifecycle interface around a direct Three.js runtime.

## Requirements

- Node.js 22 or newer
- pnpm 11.24.0
- A current browser with WebGL2 for the playable view

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`, choose **Enter Chardin**, then use W/S or Up/Down to walk and A/D or Left/Right to turn. Hold Shift to run, press Space to jump, E to act, and Escape to pause. Touch devices receive two-thumb controls with action buttons; standard gamepads use the two sticks, A/B, left-stick click, and Menu. The Pause control stops the rendering loop. When WebGL2 is unavailable, the page presents an accessible static explanation and retains the health link.

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

## Current limits

WIL-119 adds normalized keyboard, touch, and standard-gamepad controls while preserving deterministic fixed-step movement. A final GLB Traveler, authored grass, landmarks/skyspace, postprocessing, adaptive quality, audio, analytics, and deployment to `chardin.chezchardin.com` remain deferred.
