# ADR 0001: Direct Three.js runtime

- Status: Accepted
- Date: 2026-09-05

## Context

Chardin needs an immersive full-viewport world while retaining the Atlas-derived Next.js shell, health endpoint, and accessible HTML lifecycle controls. Rendering and simulation have imperative ownership and teardown requirements that should not leak through the React tree.

## Decision

Keep `page.tsx` and `layout.tsx` as Server Components. Mount one narrow Client Component that owns a canvas and accessible lifecycle UI. A direct Three.js composition root owns one renderer, one animation frame loop, scene resources, keyboard listeners, resize observer, and idempotent disposal. Pure movement code remains separate from Three.js scene objects.

The WIL-117 motor is intentionally basic. WIL-118 will replace its variable-step movement and foundation camera with fixed-step, pole-safe locomotion and transported camera behavior.

## Alternatives

- React Three Fiber was rejected for this foundation because declarative scene ownership adds another lifecycle layer without solving a current product need.
- An embedded Vite application was rejected because it would introduce a second application boundary, build, and routing surface.

## Consequences

React stays responsible for metadata, semantic UI, status announcements, and visibility lifecycle. The engine is responsible for capability detection, scene state, rendering, input, resizing, and GPU cleanup. Imperative code must be covered through narrow contracts and browser smoke tests.

Reconsider this decision if direct ownership becomes a repeated source of lifecycle defects, or if future content workflows materially benefit from a declarative renderer enough to justify migration cost.
