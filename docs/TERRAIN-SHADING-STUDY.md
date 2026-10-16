# Terrain shading study — issue #173

The owner selected B from the paired images, then reported trying B in the game and preferring it
on 2026-10-16. B is now the only terrain shading in `/fjord-play` and Environment Lab. The obsolete A selector
and query override have been removed at the owner’s request. The paired gallery and measurement
files remain historical evidence; no instrumented physical Safari/iPhone measurements were collected.
The owner gameplay trial is qualitative. Select **Zoned blend** in the Lab when reviewing the
approved island materials.

## B: shared heightfield normals

Preparation sums the area-weighted normals of the existing canonical adjacent triangles at
heightfield corners. Every duplicate grassy/soil vertex uses the same normalized corner vector.
The duplicate vertex layout, alternating diagonals, XYZ, indices, source UVs, mask UVs and
six-layer ground stack remain unchanged. Native material clones use `flatShading: false`;
source materials and character/house props retain their existing flags. The optional climate
snow candidate also uses shared normals.

Canonical **bedrock** corners retain a proportion of their original face normal using the
existing saved `rockExposure` field. Other existing primary zones receive fully shared normals.
This deliberately preserves some exposed rock definition rather than adding a second slope
classifier. The flat deep-sea boundary retains its upward normal where it meets the existing
outside-height continuation. No heights, world queries, navigation or saved fields change.

The normal bake yields after 2,048 accumulated faces, 4,096 normalized corners and 8,192 emitted
vertices. Active CPU time and maximum batch duration are reported separately from awaited yields.
Temporary storage is 28 bytes per canonical corner: three Float64 sums and one Float32 rock
weight. These arrays are released after preparation; retained geometry attributes have zero byte
delta. No normal rebuild or extra noise runs per frame or on path-wear updates.

## Diagnosis and UV scope

**Normals only** removes source maps while retaining lit native terrain. **Grass albedo only**
holds the chosen normals fixed and shows the approved Ground037 source on its existing physical
projection, without normal, roughness or biome-mask maps. Compare these against **Source materials**
at the same camera and light. This separates geometry lighting from periodic source detail and
zoning transitions. UV0, UV2, UV3 and especially the UV1 alpha-mask channel remain byte-identical.

C is conditional, not a promised feature: only add a restrained source-coordinate warp if these
controls demonstrate residual periodic source tiling that warrants it. No custom shader, new
texture source, extra fragment lookup or terrain subdivision is included in this pilot.

## State and loading contract

Shading adds no exported WorldBlueprint or campaign fields. Existing saves retain their canonical
terrain. Changing a Lab diagnostic prepares a replacement mesh asynchronously while the old mesh
stays visible. The latest request wins; stale meshes are disposed. Returning to the reference
scene invalidates pending replacements. Normal, colour, roughness, rock-axis and seasonal material behavior use the existing renderer.

## Reproduce

- `node --test tests/terrain-shading-study.test.mjs`
- `node scripts/qa/check-terrain-default.mjs` against the normal production build on 5180.
- Run the normal Vite development server on 5193, then `node scripts/qa/check-terrain-shading.mjs`
  to verify the B-only Lab, diagnostics, unchanged exports and quality switches.
- The historical A/B capture and measurement runners are available at commit
  `504051c4c1edcf6a26b0c18ca99be3c35e72759e`; reproduce that experiment on its pinned revision.
  A has no runtime path in the current build.

The QA bridge is injected only by the isolated QA server and is absent from normal builds.
See [the measured review](qa/terrain-shading/report.md). B is approved after the image review and owner gameplay trial. The default-selection change
does not alter the measured normal algorithm or the quantitative evidence above.
