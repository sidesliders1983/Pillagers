# Reference beard integration

Character Lab loads accepted beard modules from `public/appearance/beards`.
The appearance profile controls selection: male characters from age 18 only,
with the same heritage and age colour as their hair. Unavailable styles remain
absent. There are no manual style selectors and no substitute geometry.

## Accepted modules

All six beard styles are integrated: stubble, short, medium, long, split-braid
and braid. The five newly accepted styles use LOD2 even when the body is shown
in LOD0/1. Existing braid LOD0/1 assets remain available. Selection remains
automatic; no separate beard style controls are introduced.

The new fitted assets discard isolated extraction fragments below 1.5% of the
largest connected component area. Provenance records the removed vertex count.
Cheek attachments are fitted to the fixed head hull. The size slider grows the
free part with a smooth transition below the jaw; it leaves cheek attachments
fixed, avoiding detached sideburns when increasing beard size.

`braid` uses the reviewed original-reference extraction, including its binding,
and optimized LODs of 2475 / 1775 / 1175 triangles. Fitting applies the same
uniform source skull scale, centre and orientation used for generated hair.
The module attaches to the existing Head bone. Its size adjustment scales about
the jaw attachment and does not change the underlying body or skeleton.

Every GLB has a provenance sidecar with output and source hashes, extraction
history and the fitting transform. Each character owns its fitted geometry and
colour material; immutable imported sources are cached. The world keeps its
existing fixed LOD2 body configuration.

Hair and beard URLs include the geometry hash to invalidate earlier browser
downloads and factory cache entries. After updating a published GLB and its
provenance, run `node scripts/update-appearance-versions.mjs` before building.
An already-open page must be reloaded to receive updated fitting code and URLs.

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

`scratch/beards-v03/integration-status.json` records accepted modules. Optimization
status alone does not indicate publication. All six current styles have passed
placement and motion review; future additions still require that step.

The clothing extraction queue follows the beard worker. It creates candidates
from the original textured figure surfaces with a source-specific skin mask;
it does not synthesize clothing, rig candidates or publish them. Skin/fabric
boundary ambiguity must be reviewed before LOD optimization and loose fitting.

## Validation

### Per-source head calibration

The twelve original reference busts have different head centres and sizes.
`scripts/calibrate-appearance-heads.py` measures exposed head surfaces and a
neck-to-head up axis when sufficiently constrained. Otherwise it retains the
source glTF vertical. Hair uses the reference pipeline's documented Blender +Y
face direction; skin colour alone cannot distinguish front from back on short
styles. Beard attachment centroids identify the face side of the beard busts.
These estimates require visual review, rather than assuming a universal pivot.

The reviewed centres, radii, axes, measurement error and original source hashes
are stored in `src/character-lab/ReferenceHeadFrames.ts`. The calibration script
rebuilds this module from existing local originals; it generates or downloads
nothing. Its intermediate measurements remain under ignored `scratch/`.

`ReferenceHeadFit.ts` undoes the legacy published `.52` scale / `.075` origin
and maps each source frame to the actual fixed skull dimensions. The common
runtime origin is the skull bounding-box centre, with +Y up and +Z front, rigidly
attached to Head. Exported appearance groups retain that frame and source
measurement metadata. The original generated topology is retained.

Short beard attachments fit the actual skull surface, including the front;
stubble remains at 3mm clearance throughout. Free long beard sections retain
their size control. Hair additionally checks triangle interiors and edge
midpoints against the skull, because valid vertex positions alone do not prevent
coarse LOD2 triangles from cutting through the head.

`node scripts/appearance-head-fit-smoke.mjs` reviews front, side and back views
for all six hair and beard styles on LOD2, plus legacy seed 1983 and reported
seed 1885184954 on desktop and mobile viewports. Screenshots are saved in
`artifacts/head-fit-*.png`. The actual-geometry surface regression in
`tests/universal-human-motion.test.mjs` checks triangle penetration and stubble
contact, in addition to the existing animation attachment tests.

- `node --test tests/generated-beard.test.mjs tests/character-appearance.test.mjs tests/character-factory.test.mjs`
- `node --test tests/universal-human-motion.test.mjs tests/universal-human-instance.test.mjs`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/vite/bin/vite.js build`
- `PLAYWRIGHT_MODULE=<installed playwright> node scripts/generated-beard-smoke.mjs`

The browser check finds automatic profiles for all six styles at ages 35 and
70, exercises Idle/Walk/Run on LOD2, checks beard eligibility for female and
under-18 profiles and verifies the size control. Actual GLB tests verify Head
attachment through full adult/elder animation cycles and fixed cheek attachment
when changing size. Screenshots are saved under ignored `artifacts/` for review.
