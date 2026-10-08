# Character Asset Registry and Validation

`src/characters/CharacterAssets.ts` is the sole published character asset discovery
source. UI availability, Lab and World URLs, factory module registration, manifest
generation and validation use it. Compatibility imports in `GeneratedHair.ts`,
`GeneratedBeard.ts` and `AppearanceAssetVersions.ts` delegate to this registry.
An ad hoc factory registration may be used for a test or authoring preview;
published content must be added to the registry, not a handwritten UI/path list.
Automatic profile style selection also derives its eligible style lists from the
registry; `AppearanceTypes.ts` is only the semantic type vocabulary. Profile weights
are keyed by style rather than assuming a separate discovery array.

Each entry declares a stable id/type/version, LOD files, runtime LOD policy,
attachment metadata (anchor, cage, fit mode, clearance and garment slot/coverage
where applicable), material variants, budgets and tags. Material variant names
identify the existing profile colouring policy, not alternative invented geometry.
`assetMeasurement(path)` supplies actual triangles, material count, bounds, bytes
and SHA256. The generated `CharacterAssetMeasurements.ts` and
`public/character-assets.manifest.json` are derived snapshots; do not edit them.
The JSON manifest can be read by Blender/Python and other pipeline tools.

## v0.4 acceptance boundary

Issue #18 withdraws the previous visual qualification of the current appearance
library. Legacy provenance may still record `reviewRequired: false`; that flag
records the earlier pipeline outcome and does not constitute v0.4 acceptance.
All current hair, beard and clothing entries remain available for inspection
through registry-based Auto/None/manual Lab controls. None was republished or
reapproved by the tools foundation. New content still requires source provenance,
canonical fit metadata, validator checks and independent style/fit review.

Runtime URLs have content hash cache keys. Hair uses the legacy LOD2 surface
for every body LOD; its LOD2 can be as detailed as LOD0. Most beards also use
LOD2; braided beard preserves its three LODs. Body variants have decreasing
triangle budgets (10000/5000/1600). Head module budgets are defined by concept:
hair 3,000 triangles (braided hair 4,000), beard source surfaces 1,600 (braided
beard LOD0 2,800 and LOD1 2,000). Reviewed head modules use one shared
profile-colour material, including their original tie geometry.
An additional `runtimeTriangles` cap applies after contact fitting, so shell
subdivision cannot silently multiply the draw cost. Beard runtime shells allow
2,000 triangles; hair keeps its source concept cap.

The first [reference clothing batch](base-clothing.md) adds three full outfits.
Their runtime LOD2 is independent of body LOD, with a 4,400-triangle/one-material
budget and one 512px baked reference albedo. The registry declares drape regions
and measured neutral source-joint calibration rather than per-character offsets.
Published outfits retain the intact body underneath (`covers: []`); the generic
coverage API remains available for deliberately authored and reviewed modules.

## Authoring → registry → validator → runtime

1. Generate from the supplied reference and use the existing Blender optimization,
   extraction, rigging and fitting scripts. Keep unreviewed output in `scratch/`.
2. Review front/side/back orientation and extraction against the reference, and fit
   against the #15 head/cages. Publish accepted GLBs with SHA256 provenance and
   explicit `reviewRequired: false` for runtime variants.
3. Add the accepted stable entry/LODs/metadata to `CharacterAssets.ts`. Clothing
   candidates are not discovered by scanning scratch directories.
4. Run `npm run assets:registry` to measure the declared library and regenerate
   snapshots. The old `node scripts/update-appearance-versions.mjs` command delegates
   here for existing queues. Measurement never generates, downloads or optimizes assets.
5. Run `npm run validate:characters`, then visually review the Golden Characters in
   Lab before accepting new appearance content.

The registry generator first checks every declared file/provenance and only then
writes snapshots. Snapshot regeneration does not approve an asset or bypass validation.

For a coordinated appearance quality pass, keep an immutable acceptance ledger
with each candidate's file SHA256, triangle/material counts, the loaded fit
implementation hashes and independent visual evidence. A candidate pass applies
to that exact combination; changing its geometry, calibration or fit solver
requires a new review. Publish asset writes sequentially. Only after every
declared variant is approved should its attachment metadata switch to the baked
canonical frame. Accepted hair/beard exports use one profile-colour material;
the final registry material cap is one. Do not change the frame or cap while the
published files still use the previous authoring convention.

The shared provenance validator follows nested original generation history and
pins measured source frames to its generated SHA256. It checks SHA256 syntax,
direct authoring parent links and the published output hash, and requires
`reviewRequired: false` only on runtime exports. Original generation and
intermediate candidates may retain `reviewRequired: true`; those flags do not
stand in for an approval of the final asset. Historical extraction/batch
envelopes omitted some intermediate source records. Those links are explicitly
reported as unverified, rather than reconstructed or represented as verified.
New authoring stages should embed the direct parent provenance and source hash.
Scratch paths are historical evidence; repository validation does not require
those local files to exist on CI or silently regenerate them.

Measured reference garments also declare their final `outputGarmentBind` at the
top level of each published provenance. This explicitly names the neutral frame,
metres, +Y up, +Z front and ground origin, and records all 17 canonical joints
plus the exact authored `garment-bind.json` byte hash. Validation compares every
final joint with registry `garmentBind` using a Euclidean tolerance of 1 micrometre.
A matching joint table buried in source ancestry cannot excuse a different or
missing output frame. The original generated figure's measured stance can differ
from this calibrated output. Publish the exact authored `garment-bind.json`
beside each garment GLB. Registry regeneration and character validation verify
those public bytes against the declared hash and final table. A separate regression
compares registry and output joints with the actual neutral body rig at every
body LOD, so two matching but incorrectly calibrated tables cannot establish
canonical authority. Publication review additionally verifies byte identity with
the accepted candidate sibling; CI does not need the historical scratch files.
Published appearance/clothing provenance and bind JSON preserve their exact
generated bytes through `.gitattributes`, including line endings. This prevents
Windows checkout conversion from changing a declared metadata hash on CI.

After publication, regenerate measurements once, run `npm run validate:characters`,
the full tests and `npm run build`, then review the actual public assets across
the Golden morphology fixtures, all body LODs and Idle/Walk/Run. Include the Lab
desktop/mobile view on the running preview. Candidate-only screenshots or finite
geometry checks do not satisfy that final visual gate.

## Fast repository/runtime validation

```sh
npm run validate:characters
node scripts/validate-characters.mjs --assets-only
npm test
npm run build
```

`validate:characters` requires Node 24 and installed repository dependencies;
no GPU, image generation, network, Blender or browser is needed. Errors identify
the asset id/LOD or Golden Character and violated rule; failure exits nonzero.

The type-aware checks cover unique ids/paths, LOD declarations, version/attachment
metadata, valid sockets/cages/coverage, self-contained GLB v2 structure, finite
accessors, indices/morph attribute counts, embedded texture references/signatures,
material and source/fitted triangle budgets, unused vertices, degenerate/duplicate
faces, unit and consistently directed normals, hash/provenance and generated manifest consistency,
sane measured bounds and scale. Body checks enforce one allowed skeleton, all
contract bones/sockets, morphology names, normalized skin weights, valid animation
channels/times, Idle/Walk/Run, grounded +Y scale and toe-forward +Z orientation.
The forward check covers both local mesh coordinates and loaded scene transforms.
Head module checks enforce a rigid module without another armature and a valid
measured up/front/centre frame.

Runtime checks construct all 12 Golden Characters, verify independent skeleton
clones, canonical sockets/landmarks/cages and finite transforms/morphs/skinned
vertices during Idle/Walk/Run. They also exercise World creation/aging application
and equip every registered module, including styles not selected by fixtures.
These are compatibility tests, not performance benchmarks or pixel comparisons.

Embedded texture data is checked structurally and by file hashes; Node does not
decode image pixels. Measured frame validity cannot infer the true face direction
of arbitrary unlabelled reference geometry. Correct extraction, silhouette,
front/back semantics and visual fit still require authoring/browser review.
`scripts/characters/geometry-quality.mjs` additionally reports positional-welded
component, boundary, non-manifold-edge/vertex and opposed-normal counts for that review.
The topology evidence joins all semantic mesh regions in their active scene/node
frames and welds using a metric tolerance across neighbouring spatial buckets.
Component details include triangle/vertex count, surface area in square metres,
bounds, mesh/region names and boundary counts, making small floating fragments
visible without treating separate braid ties as faults. UV and flat-shading
vertex copies are welded only for inspection. Open hems,
hairlines and separate braid ties are intentional; a zero boundary/component
threshold would reject legitimate reference geometry and does not prove fit.
Vertex-link diagnostics identify pinched vertices where disconnected triangle
fans meet only at one point, even when every edge belongs to at most two faces.
A valid interior link is one closed cycle; an open-boundary link is one path.
`vertexLinkDetails` records the world position, incident/collapsed face counts,
boundary and repeated-link edges, link component counts and degree histograms.
Module validation rejects non-manifold edges and disconnected or pinched vertex
links. Intentional open boundaries and separate module parts remain valid; an
open hairline or hem is not by itself an invalid vertex link. Component/boundary
counts still require semantic and visual review rather than a blanket zero rule.

CI runs build, character validation and tests on Node 24 using the committed pnpm
lockfile. The licensed scenery kit is not in Git: CI builds the character tools
without it and reports that World requires an authorized local `Assets/` copy.

## Blender authoring validation

The existing [optimization pipeline](../ASSET-OPTIMIZATION-V01.md) owns mesh cleanup,
decimation, texture resizing and export reports. Run `npm run assets:test` with
Blender installed (`BLENDER_PATH` may select it), and `npm run assets:optimize --
source.glb output-directory` for authoring. This slower authoring path remains
separate from CI. Its accepted exports feed the registry and fast validator;
neither the validator nor a status monitor restarts model generation.

Thin native coverage can be authored with `node scripts/bake-head-coverage.mjs
source.glb output.glb Module_name_LOD2 style`. Its input is a pigment-selected,
canonical source module with provenance. It projects the original source triangle
coverage onto the actual CharacterFitSystem HEAD cages; a common angular
partition across body LOD0/1/2 avoids facets crossing skull folds. The atlas uses
at most 1 mm per texel, outside-facet sampler padding and standard alpha MASK with
white RGB for the shared DNA tint. Only fully transparent facets are removed,
with a conservative sampling guard. It never redraws or dilates visible source
contours. The output records source and body hashes and remains `reviewRequired`
until independent reference/fit/motion review; the utility never publishes assets
or changes runtime attachment policy.
