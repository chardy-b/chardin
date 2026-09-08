# Chardin traveler model

`traveler.glb` is an original Chardin-owned low-poly character generated entirely from Three.js primitive geometry by `scripts/generate-traveler.mjs`. It contains no downloaded meshes, textures, branding, shaders, or third-party creative assets. No project-wide redistribution license is declared; licensing for redistribution remains a project-owner decision.

- Coordinate convention: meters, `+Y` up, `-Z` forward; feet rest at `Y=0`.
- Root node: `Traveler`; authored runtime scale: `1`.
- Attachment nodes: `Head` (`cameraFocus`), `LeftHand`, and `RightHand`.
- Animation clips: `Idle`, `Walk`, `Run`, and `Jump` (deterministically named).
- Missing optional locomotion mappings fall back to `Idle`; every declared mapping and attachment must exist in the loaded file.

Regenerate with `pnpm generate:traveler`. The generator uses only the repository's lockfile-pinned Three.js `GLTFExporter` and writes a deterministic binary GLB.
