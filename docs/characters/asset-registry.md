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

Runtime URLs have content hash cache keys. Hair uses the reviewed LOD2 surface
for every body LOD; its LOD2 can be as detailed as LOD0. Most beards also use
LOD2; braided beard preserves its three LODs. Body variants have decreasing
triangle budgets (10000/5000/1600). Head modules have a 10000-triangle cap and
two-material cap to admit the already reviewed braid surface. This is an explicit
quality exception, not a promise of aggressive reduction at every LOD.

The first [reference clothing batch](base-clothing.md) adds three full outfits.
Their runtime LOD2 is independent of body LOD, with a 4,400-triangle/one-material
budget and one 512px baked reference albedo. The registry declares drape regions
and partial sleeve coverage rather than per-character hand-tuned offsets.

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
material and triangle budgets, hash/provenance and generated manifest consistency,
sane measured bounds and scale. Body checks enforce one allowed skeleton, all
contract bones/sockets, morphology names, normalized skin weights, valid animation
channels/times, Idle/Walk/Run, grounded +Y scale and toe-forward +Z orientation.
The forward check covers both local mesh coordinates and loaded scene transforms.
Head module checks enforce a rigid module without another armature and a valid
measured up/front/centre frame.

Runtime checks construct all 12 Golden Characters, verify independent skeleton
clones, canonical sockets/landmarks/cages and finite transforms/morphs/skinned
vertices during Idle/Walk/Run. They also exercise World creation/aging application
and equip every registered head module, including styles not selected by fixtures.
These are compatibility tests, not performance benchmarks or pixel comparisons.

Embedded texture data is checked structurally and by file hashes; Node does not
decode image pixels. Measured frame validity cannot infer the true face direction
of arbitrary unlabelled reference geometry. Correct extraction, silhouette,
front/back semantics and visual fit still require authoring/browser review.

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
