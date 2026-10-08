# KayKit nature pass v0.3

Developer-only Environment Lab; Fjordside /play and production scenery are unchanged. Depends on PR #62 / #57. Original reference files, hashes and crop coordinates: [environment references](references/environment/README.md).

## Exact sources and delivery

Official KayKit Forest Nature Pack **1.0 FREE**, Kay Lousberg, CC0. The [file lock](references/environment/kaykit-source-lock.json) predates integration and lists fourteen exact case-sensitive glTF/buffer filenames, archive SHA-256 and the original shared gradient atlas. No paid terrain, mirrors, substitutes or newly authored tree/rock meshes are used.

Run `node scripts/asset-pipeline.mjs nature scratch/kaykit-source/extracted/KayKit_Forest_Nature_Pack_1.0_FREE`. The existing pipeline action verifies every source against the lock before publishing `public/nature/kaykit-v1`. It converts containers with glTF-Transform 4.2.1 while retaining authored accessors, nodes, UVs and materials. Runtime glTF+BIN files share the unmodified atlas; embedded GLB audit copies have hashes in the delivery manifest. Only the selected models are published.

AssetManager fails on a missing manifest/required role; no primitive fallback. Normalized roots center world X/Z and ground minY. Repeated assets use InstancedMesh per source mesh primitive with `placementMatrix × sourceNode.matrixWorld`; internal transforms survive. Source forest materials/atlas are shared. A modest foliage material tint (0xb7c9b8) tempers the original bright green without repainting UVs/atlas. Rock materials retain the original source color.

Seed 1983 groups three distinct conifers behind village clearances, sparse deciduous accents, two authored rock groups with smaller stones along a broken shore, bushes and primary KayKit clumps. Placement uses surfaceHeightAt, paths and rotated shared footprints, with radius checks around routes. Failed placement is skipped. Rock bases are sunk 0.12m to meet uneven terrain. GrassField remains optional and off; no terrain mutations or custom shaders.

Existing Meshy houses at their canonical parcels and the unchanged 1.8m Meshy body form the scale reference. The lab now uses the shared ACES renderer; production renderer/lighting code is unchanged. Scenery layer controls isolate ground, KayKit, village and water. The lab retains sourced boona13 water.

## Evidence and limitations

Source/runtime contact sheet: [QA sheet](qa/environment-v03/source-runtime-contact-sheet.png), common orthographic scale with unchanged house/person. Source containers are shown before runtime placement/tint; silhouette/UV identity is retained. Full-size fixed-camera captures and fixture metadata are under docs/qa/environment-v03. TDD public browser check failed with missing KayKit layer control before implementation and then passed. TypeScript passes.

KayKit's authored conifers are simpler than the mock-up crowns; bright greens, grouped outcrop style and broad bare farm clearances still require owner review. Ground maps alone cannot supply the desired backdrop. Dusk has no existing preset. Sourced water uses sky-gradient reflection, not reflections of our scene geometry. Dock/cliff/backdrop completeness and owner approval are #59 gates; #60 remains pending. No visual acceptance is inferred from tests.
