# Three.js r187 spike (#323)

This is an isolated experiment on `codex/three-r187-spike-323`, based on main
`01dc5f79c9b8ee4024c0fbed338af4778a5f4c97`. It must not be merged or published by default.
The public Sites release remains build 12 with Three.js r180.

## Current status

The unchanged baseline and r187 experiment both pass the complete production
build and open the fixed physical settlement fixture in native desktop Chrome
WebGL2. The short pilot is runner validation, not comparative performance evidence.
The frozen protocol is [protocol.json](protocol.json); measurements and physical
Safari acceptance are still pending.

## Compatibility audit

| Area | Actual Fjord path and risk | Check |
| --- | --- | --- |
| Renderer/tooling | WebGLRenderer/WebGL2, ACESFilmic, sRGB; Vite 7.3.6, TypeScript 5.9.3, Node 24, pnpm 10.34.9 | Both builds pass; no WebGPU imports in the live renderer |
| Dependencies | three 0.180.0 to pinned 0.187.0; three.quarks/quarks.core unchanged at 0.16.0, peer accepts >=0.165 | Only required Three/type dependency changes; meshoptimizer 1.1.1 is a transitive typing dependency, runtime optimizer remains 0.22.0 |
| Typings | Published @types/three still 0.186.0 on release day | Type assertions specify known bitmap/data images; no runtime algorithm changes. Matching r187 typings remain an adoption limitation |
| Terrain/snow/nature | BlueprintTerrain, GroundBlending, SeasonTint, StructureSeasonTint, NatureWind, DirectionalAtmosphere use shader chunks and native materials | Shader compilation, summer/winter/marsh visual comparison required |
| Water | FjordsideWater/vendor WaterPlane and UnifiedWaterLighting; GLSL shaders, clipping, scene fog | Water edge/colour/reflection screenshot comparison required |
| Sky | Fjord uses WorldLighting/SeasonAppearanceTransition and its existing scene appearance, not addon Sky | The addon Sky gamma/up migration does not directly alter this path |
| HDR | Optional FjordHdrLighting uses HDRLoader and PMREMGenerator; environment rotation/intensity retained | r187 changes PMREM target/sampling. Compare HDR both on and off; no exposure compensation |
| Portraits | ResidentPortraitStudio reuses the scene renderer with a native render target and restores viewport/scissor | r187 changes target pixel-ratio semantics. Test portrait selection and restoration, particularly DPR >1 |
| Shadows | Live PCFShadowMap, low cap 1024; r182 changed PCF softness | Verify shadow edges and bias. Deprecated PCFSoft remains in Character Lab, outside the live default |
| Instancing | InstancedMesh for nature/scenery/grass; no BatchedMesh usage in source | Do not attribute BatchedMesh fixes to this game |
| Disposal | Scene, world, model/template, bitmap, instancing, portrait, HDR and context owners explicitly dispose | Four in-place import cycles plus retained heap/resource checks required; counts are not GPU bytes |
| Object transforms | ResidentPortraitStudio and vendor grass disable matrixAutoUpdate | Check r185 matrixWorldNeedsUpdate semantics against actual rendering, without broad refactors |
| Postprocessing/WebGPU | No EffectComposer or TSL/WebGPU live render pipeline | Many r187 WebGPU changes do not apply. No WebGPU feasibility arm is necessary for this issue |
| Menu aurora/clouds/water | EntryBackdropRenderer is a standalone native WebGL1 quad, no Three import | Upgrade does not animate it differently or reduce its resource limits; entry/scene release must remain intact |
| Generation | Lockfile is part of the prepared island input fingerprint | Official regeneration ran for all 14 entries; every canonical world and compressed entry is byte-identical. Only lockfile fingerprint changed |

The inventory, file hashes and exact package versions are in
[source-audit.json](source-audit.json). [island-regeneration.json](island-regeneration.json)
proves the unchanged physical worlds. Historical reports and fixtures are retained.

## Official sources

- [r187 release notes](https://github.com/mrdoob/three.js/releases/tag/r187), released 30 October 2026.
- [Migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), all steps from r180 through r187 reviewed.
- Frozen source extracts and their hashes are retained in `sources/` and the audit.

Relevant engine changes are PMREM/PBR appearance, target viewport scaling,
WeakRef/FinalizationRegistry use, texture/geometry disposal, PCF filtering and
matrix-world invalidation. The numerous WebGPU/TSL and BatchedMesh changes are
not performance evidence for the current live path. Clock is deprecated but still
works; the spike preserves it to avoid introducing a second timing change.

## Reproduce

Use Node 24, pnpm 10 and a current Git. Keep baseline main and this branch in
separate D: worktrees, install their frozen locks, then run `pnpm run build`.
Run native Chrome without SwiftShader overrides. The default benchmark fixture
has five built homes, residents, livestock, the normal wildlife layer and an
actual two-person physical expedition, built through current public commands.

```powershell
node scripts/qa/prepare-three-r187-fixtures.mjs
node scripts/qa/audit-three-r187.mjs
# Baseline: vite preview --host 0.0.0.0 --port 5206 --strictPort
# Experiment: vite preview --host 0.0.0.0 --port 5207 --strictPort
node scripts/qa/benchmark-three-r187.mjs --arm=A --origin=http://127.0.0.1:5206 --output=scratch/three-r187-323/run-1-A
node scripts/qa/benchmark-three-r187.mjs --arm=B --origin=http://127.0.0.1:5207 --output=scratch/three-r187-323/run-2-B
```

The runner saves bounded raw frame intervals, long tasks, official diagnostics,
load-stage timings, renderer resources, browser/GPU identity and screenshots.
Fresh browser contexts do not prove cold OS/driver caches. JS heap is optional;
renderer resource counts are not byte estimates. Headless Chrome is not iPhone
Safari. Device/browser and observed thermal conditions must be reported separately.

## Recommendation

Pending the full A/B evidence and actual iPhone Safari test. No production
upgrade, performance win or absence of leaks is claimed from the short pilot.
