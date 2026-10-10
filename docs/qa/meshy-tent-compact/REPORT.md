# Compact tent scale review - 10 October 2026

The owner requested approximately 1.50m height and at most 2m along the longest ground axis. The decoded production GLB measures 1.50007m tall including the pole extensions, 1.87868m wide and 1.99980m long. The front proportions retain uniform scaling; the depth is shortened independently to meet both constraints. Original source geometry and textures remain preserved locally; no further Meshy generation was used.

The first dimension test failed at the initial 2.60m height. Both exported-GLB tests now pass: target dimensions, open doorway, empty interior, low floor and visible inner surfaces. Ray probes use the compact scale, with entrance samples at 0.25m, 0.5m and 0.8m. The Node test uses the real GLTFLoader and mocks only bitmap decoding; the actual textures are visually checked in the browser.

## Existing Fjord review

Visually reviewed [Reference exterior](reference-tent-day.webp), [Reference interior](reference-tent-interior-day.webp), [generated exterior](generated-17-tent-day.webp), [night](generated-91-tent-night.webp) and the wider village views. The original linen, crossed timbers, ropes, faceted silhouette and empty interior remain visible. The cameras now frame the smaller model. Collision bounds come from the smaller source mesh; the existing 0.65m margin remains.

| Scene | Preserved tent location (x, z) | Closest observed resident clearance | Resident displacement |
| --- | --- | --- | --- |
| reference | 9, 17 | 4.22m | 4.15-6.31m |
| generated-17 | 46, 17 | 5.13m | 0.84-6.33m |
| generated-91 | 46, 17 | 2.17m | 1.99-6.15m |

Each scene records twenty snapshots of ten moving residents. Every sample stayed safe, followed rendered ground height and remained outside the complete tent footprint plus the margin. These are sampled scene checks, not exhaustive guarantees for every route or world seed.

## Saves and checks

- Previous v2 previews import, resize at the original tent position and export as v3. The blueprint and other twenty props compare unchanged. Reloading the migrated v3 save reproduces exactly the exported file, including the original tent position.
- Previous v1 files preserve their twenty props and version, and still round-trip unchanged.
- The visible old-preview test first exposed rejection of the changed source bounds; migration and its subsequent reload are now covered through the existing export/import controls.
- Existing Fjord browser regression passed fresh startup/reload, generation, Reference fallback, pause and geography save/load.
- TypeScript and the production build passed, with the existing large-chunk warning. Targeted GLB tests passed. The initial full-suite and character audits remain recorded in [the original review](../meshy-tent/REPORT.md); current-head GitHub checks run the full contracts again.
- Formatting was reviewed manually and git diff --check passed; no repository formatter is configured.

A review retry hit a cancelled Edge download and then a full local disk. Removing only this branch's reproducible build directory freed space; the complete browser run then passed without browser errors. The original measurement report and images remain untouched. Current snapshots are in [results.json](results.json).
