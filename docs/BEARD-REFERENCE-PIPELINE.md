# Reference beard integration

Character Lab loads accepted beard modules from `public/appearance/beards`.
The appearance profile controls selection: male characters from age 18 only,
with the same heritage and age colour as their hair. Unavailable styles remain
absent. There are no manual style selectors and no substitute geometry.

## Accepted module

`braid` uses the reviewed original-reference extraction, including its binding,
and optimized LODs of 2475 / 1775 / 1175 triangles. Fitting applies the same
uniform source skull scale, centre and orientation used for generated hair.
The module attaches to the existing Head bone. Its size adjustment scales about
the jaw attachment and does not change the underlying body or skeleton.

Every GLB has a provenance sidecar with output and source hashes, extraction
history and the fitting transform. Each character owns its fitted geometry and
colour material; immutable imported sources are cached. The world keeps its
existing fixed LOD2 body configuration.

## Remaining work

Further processing and fitting now focus on LOD2 only. Use
`optimize-character.py ... --lod 2` to skip the LOD0/1 reduction, UV and bake
stages; existing three-LOD results are reused. The beard fitter defaults to
LOD2, with explicit `--lod 0` or `--lod 1` available later. Character Lab starts
in LOD2; existing LOD0/1 assets remain accessible.

`scripts/run-beard-lod-queue.ps1` processes stubble, short, medium, long and
split-braid serially from the existing extracted reference models. It waits for
the extraction review renderer when given its process ID, uses two Blender CPU
threads, records per-style stages and never publishes results. Incomplete output
directories are preserved for inspection rather than overwritten. Do not start
another copy while its named mutex is held.

Inspect `scratch/beards-v03/lod-queue-status.json`, individual optimization logs
and reports. Stubble and short have small stray source fragments; medium has
irregular edges. Inspect and correct the optimized original surfaces before
fitting and extending `GeneratedBeard.ts`. Split-braid bindings also require
inspection. These five styles are not yet accepted or integrated.

The clothing extraction queue follows the beard worker. It creates candidates
from the original textured figure surfaces with a source-specific skin mask;
it does not synthesize clothing, rig candidates or publish them. Skin/fabric
boundary ambiguity must be reviewed before LOD optimization and loose fitting.

## Validation

- `node --test tests/generated-beard.test.mjs tests/character-appearance.test.mjs tests/character-factory.test.mjs`
- `node --test tests/universal-human-motion.test.mjs tests/universal-human-instance.test.mjs`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/vite/bin/vite.js build`
- `PLAYWRIGHT_MODULE=<installed playwright> node scripts/generated-beard-smoke.mjs`

The browser check uses automatic profile seed 12, all three LODs and Idle,
Walk and Run. Screenshots are saved under ignored `artifacts/` for visual review.
