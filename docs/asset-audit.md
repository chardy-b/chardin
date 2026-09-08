# Wave 1 asset and licensing audit

This is a local inventory/source review, not legal clearance. The implementing session made no external requests and copied no Messenger creative content. The approved research boundary remains in [messenger-runtime-notes.md](research/messenger-runtime-notes.md).

`asset-inventory.json` records paths, actual byte lengths, SHA-256 hashes, source and rights status for every tracked public asset, app favicon and browser visual baseline. The coverage-backed inventory test checks completeness and exact bytes. Changed or newly tracked assets require provenance review and updated records. Hash matching proves which local files were examined; it cannot establish authorship or detect arbitrary copied material by itself.

| Scope                                              | Provenance finding                                                                                                                                      | Rights decision                                                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planet, seeded grass, surface/landmark frames      | Original authored primitive geometry and parameters in `src/engine/world`; no terrain textures or external model imports                                | Repository redistribution license remains undecided                                                                                                                                     |
| Traveler GLB, clips and fallback                   | Original primitive generator `scripts/generate-traveler.mjs`; manifest references only `/models/traveler.glb`; conventions in `public/models/README.md` | Original project content; no repository-wide license declared                                                                                                                           |
| Toon ramp, outline GLSL, light/palette/composition | Authored local implementation in `src/engine/render`, `three-runtime.ts`; no imported Messenger shader/bundle                                           | Repository license undecided                                                                                                                                                            |
| Three.js and GLTFExporter                          | Lockfile-resolved package, local package declares MIT; notice in `node_modules/three/LICENSE`                                                           | Dependency rights are separate from original repository rights                                                                                                                          |
| postprocessing and SMAA lookup data                | Version 6.39.4, local package declares Zlib; dependency license/embedded notices apply                                                                  | Retain upstream notices; not a blanket license for this repository                                                                                                                      |
| 12 `public/moodboard/*.webp` files                 | Inherited showcase derivatives; specific original image IDs in `mood-board-provenance.md`                                                               | **Redistribution rights unresolved.** Attribution/source links alone do not grant permission. They remain publicly servable even though the world page does not render the legacy board |
| Five template SVGs and app favicon                 | Inherited Atlas/Next template material                                                                                                                  | Exact asset rights/trademark decisions unresolved; do not assign the package license to a logo automatically                                                                            |
| Six visual baselines                               | Captures of original Chardin world from the existing deterministic browser suite                                                                        | Repository redistribution decision still applies                                                                                                                                        |
| Fonts/audio/other runtime downloads                | Current world uses system fonts; no audio; model loader has a fixed same-origin manifest                                                                | Future external creative content requires recorded rights first                                                                                                                         |

The reviewed tracked inventory contains no Messenger model, texture, audio, deployed bundle, clone-repository material, writing or branding. The live page composes `ChardinExperience`; the model manifest and local authored shaders are independently inspectable. This supports the documented original implementation provenance; it is not a universal copyright-detection claim. Independent security/provenance review must inspect the diff/source and exact inventory at the final head before signing off “no copied Messenger creative content.” No such independent approval has been recorded in this session.

Open owner decisions: (1) repository license for original code/art and generated Traveler, (2) permission or removal/replacement of legacy showcase derivatives, (3) legacy template icon/logo/favicon rights. No files have been silently removed, relicensed, or described as cleared to close these decisions. These remain release-readiness blockers under the approved asset policy.

The inherited dependency audit reports **two moderate advisories**. They were not rechecked through a registry in this session, and their IDs/dependency paths are not supplied by the inherited summary. Do not guess those details or state the audit is clean. The parent must retain fresh full `pnpm audit --audit-level=high --json` output, identify each advisory/version/path/fix, and record disposition at the PR head. A zero exit at the high threshold can coexist with both moderate findings; it is not zero vulnerabilities.

Parent provenance verification, after the agent exits (all local; separate from the network dependency audit):

```sh
pnpm exec vitest run tests/unit/engine/asset-provenance.test.ts tests/unit/engine/character-assets.test.ts
sha256sum public/models/traveler.glb
pnpm generate:traveler
sha256sum public/models/traveler.glb
git diff --exit-code -- public/models/traveler.glb
git ls-files public src/engine scripts
rg -n -i 'messenger|abeto|https?://' src/engine public scripts/generate-traveler.mjs
git ls-files '.env*' '*.pem' '*bundle*' '*capture*' '*report*'
git diff --check
```

Interpret matches rather than treating a keyword search as copyright proof. The generator should reproduce the inventoried hash; unexpected byte changes require investigation, not automatic baseline replacement. The exact-head full-history secret scan and CodeQL remain separate security gates.
