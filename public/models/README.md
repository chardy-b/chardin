# Chardin traveler model · v3

`traveler.glb` is original agent-assisted Chardin artwork, authored from asymmetric ring sections, a tapered jaw and swept crown/nape, shaped coat and pack, tapered sleeves, and baked joint keys in `scripts/generate-traveler.mjs`. No downloaded or traced model, texture, shader, reference silhouette or third-party creative input is used. Human ownership confirmation and the repository redistribution license remain project-owner decisions.

- Coordinates: world units, +Y up, -Z forward; supported boot soles rest at Y=0; runtime scale 1.
- Root `Traveler`; torso and independently articulated left/right legs. Each leg owns a knee, ankle and boot; torso owns arms/elbows/hands, head, scarf and pack.
- Manifest attachments: Head, LeftHand, RightHand, LeftAnkle and RightAnkle.
- Clips: Idle (2s), Walk (.8s, 1.65 units/s, .5 stance fraction), Run (.52s, 3.3 units/s, .34 stance), Jump (.7s). All 16 tracks per clip are baked, with contact/passing/flight keys; no root translation. Root extras record authoring parameters.
- Several material values share coherent toon treatment in the runtime. The exported roughness-1 Standard materials retain portable base colors; no embedded images/textures.

Regenerate with `pnpm generate:traveler`, using lockfile-pinned Three.js 0.185.1 GLTFExporter. Bytes must repeat exactly. The actual parsed hierarchy, clip data, ground contacts and loop endpoints are tested in `tests/unit/engine/traveler-authorship.test.ts`. Exact generator/model sizes and SHA-256 hashes are in `docs/design/wil146-provenance.json` and `docs/asset-inventory.json`. No GLB hash is presented as proof of authorship or browser quality. Controller capture recipes are in `docs/design/wil146-visual-loop.md`.

Binary identity: **151284 bytes**, SHA-256 `7f0cc734bf217e971f0710e6bc1d6ca89fbf9db6beda554f0c144eaefde67348`. Generator SHA-256 `44f2606ef3b9bec5d92299bc7300149c7b9da8222fea1a46823037c54940dc7e`.

WIL-146 preserves cadence and adds forward torso intent, opposing arm swing, higher run clearance and velocity-continuous swing endpoints. Runtime two-link foot placement only adjusts the articulated presentation; the motor retains root/support ownership. Continuous temporal and visual acceptance remain controller-owned.
