# Chardin traveler model · v2

`traveler.glb` is original agent-assisted Chardin artwork, authored from elliptical ring sections and baked joint keys in `scripts/generate-traveler.mjs`. No downloaded or traced model, texture, shader, reference silhouette or third-party creative input is used. Human ownership confirmation and the repository redistribution license remain project-owner decisions.

- Coordinates: world units, +Y up, -Z forward; supported boot soles rest at Y=0; runtime scale 1.
- Root `Traveler`; torso and independently articulated left/right legs. Each leg owns a knee, ankle and boot; torso owns arms/elbows/hands, head, scarf and pack.
- Manifest attachments: Head, LeftHand, RightHand, LeftAnkle and RightAnkle.
- Clips: Idle (2s), Walk (.8s, 1.65 units/s, .5 stance fraction), Run (.52s, 3.3 units/s, .34 stance), Jump (.7s). All 16 tracks per clip are baked, with contact/passing/flight keys; no root translation. Root extras record authoring parameters.
- Several material values share coherent toon treatment in the runtime. The exported roughness-1 Standard materials retain portable base colors; no embedded images/textures.

Regenerate with `pnpm generate:traveler`, using lockfile-pinned Three.js 0.185.1 GLTFExporter. Bytes must repeat exactly. The actual parsed hierarchy, clip data, ground contacts and loop endpoints are tested in `tests/unit/engine/traveler-authorship.test.ts`. Exact generator/model sizes and SHA-256 hashes are in `docs/design/wil145-provenance.json` and `docs/asset-inventory.json`. No GLB hash is presented as proof of authorship or browser quality. Controller capture recipes are in `docs/design/wil145-visual-loop.md`.

Binary identity: **147624 bytes**, SHA-256 `fce9de28e7db1b2fda68764582f4b1c5e968f5ee4b525e648e5bc7a80496147d`. Generator SHA-256 `c3eef38a45e497ebd704d5333c20bfc775317c646e25f07746d5b753a2ca90ee`.
