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
pnpm test:coverage
pnpm build
pnpm test:e2e
```

The health endpoint remains available at `/api/health`.

## Architecture and provenance

- [Canonical context](docs/context.md)
- [Direct Three.js ADR](docs/adr/0001-direct-three-runtime.md)
- [Research and legal boundary](docs/research/messenger-runtime-notes.md)
- [Original asset policy](docs/original-asset-policy.md)

The playable world uses original, code-generated primitive geometry. Legacy showcase thumbnails and template assets remain in the repository with unresolved redistribution decisions; see the [asset audit](docs/asset-audit.md). External assets require documented redistribution rights. The tiny planet is generated deterministically from a fixed seed: faceted moss, sage, ochre, and warm-earth face colors form broad regions around a compact spawn patch, while one bounded instanced mesh supplies varied three-blade grass tufts across every latitude. Explicit `low` (2,160 terrain vertices / 720 triangles / 520 tufts), `medium` (2,940 / 980 / 960), and `high` (3,840 / 1,280 / 1,520) content profiles live in `src/engine/world/planet.ts`; the runtime selects `low` or `medium` conservatively from device capabilities, and couples terrain and grass when visual quality changes. Each profile uses at least the original detail-5 terrain baseline, and grass bases are queried against those rendered facets. Invalid non-finite optional counts fall back to the selected profile, finite counts clamp to the 1,520-instance ceiling, and negative counts produce no instances. A stable data-only landmark surface frame reserves a cleared site for future skyspace without adding architecture or collision.

The third-person traveler is reproducibly generated with `pnpm generate:traveler`. Its node names, clips, coordinate convention, scale, provenance, and license are documented in [`public/models/README.md`](public/models/README.md). The runtime validates this manifest before use and retains a visible primitive fallback during loading or after failure. A future character swap is data-only in `src/engine/assets/manifest.ts` when it preserves that contract.

## Rendering and resilience

Choose **Visual quality** to select Low, Balanced, or High. The renderer caps pixel density, shadow maps, grass, terrain detail, and effect resolution together. Sustained slow frame windows can lower quality; automatic upgrades are disabled. Content is prepared during loading, and changing visual detail never changes the smooth spherical motor collider.

Original toon bands, depth and normal outlines, soft shadows, restrained bloom, and a mist palette shape the world. Reduced motion freezes idle and ambient drift and disables bloom while preserving walking, jumping, and manual look. The preference updates without reloading.

Loading waits for the traveler (or its visible fallback) and antialiasing resources. If a model request stalls for eight seconds, entry becomes available with the primitive fallback. Graphics loss stops play; restoration rebuilds disposable resources and offers **Resume**. A fatal failure offers **Retry**, followed by a new **Enter Chardin** gesture. See [rendering ownership and profiles](docs/rendering.md).

Browser tests build with `NEXT_PUBLIC_E2E_HOOKS=true`. Only that exact build-time value exposes deterministic controls; `?e2e=1` alone does nothing in ordinary production. Test captures use fixed simulation steps and strict pixel comparison in Chromium/SwiftShader. Device emulation is not physical-device performance evidence; the targets remain 60 fps on typical desktop hardware and 30 fps in reduced mobile mode, pending measurements on representative hardware and Safari/iOS verification.

## Current limits

WIL-119 adds normalized keyboard, touch, and standard-gamepad controls while preserving deterministic fixed-step movement. Simultaneous keyboard walk and turn inputs are radially normalized, so each axis is approximately 0.707 at full diagonal input rather than matching WIL-118's full-rate values on both axes. Touch joystick groups remain pointer-operated; their semantic names describe them to assistive technology, but non-pointer movement still requires a keyboard or compatible controller. The Traveler's compact procedural clips intentionally omit facial and finger animation; missing optional locomotion mappings fall back to `Idle`. Landmark architecture/skyspace, audio, analytics, and deployment to `chardin.chezchardin.com` remain deferred.

## Wave 1 release evidence

WIL-123 adds bounded desktop/mobile-emulation performance collection, production bundle inventory, keyboard/touch/reduced-motion/fallback assertions, engine-specific coverage gates, and exact-head command records. See the [release evidence ledger and standalone commands](docs/release-readiness.md) and [measurement method and pending budgets](docs/performance.md). On 2026-09-08, all ten collection gates passed at exact head `4c04fcde4ab49a937f7c8cf3a54114bcf8c921b7`; both inherited moderate qs advisories were remediated, and the retained high/all-severity audits report zero advisories. Collection is not release approval: both software-renderer RAF targets failed, and approved numeric cost budgets with strict reruns, representative hardware/Safari evidence, terminal exact-head CI/security checks, remaining independent approvals and repository/legacy-asset license decisions remain unresolved. See the dated ledger for raw report references; those records do not validate later changes. Deployment, DNS and Vercel provisioning remain out of scope.
