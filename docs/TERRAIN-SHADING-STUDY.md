# Terrain shading study — issue #173

The owner selected B from the paired images, then reported trying B in the game and preferring it
on 2026-10-16. A separate integration step enables B by default on `/fjord-play`.
The study and reference APIs retain A as an explicit comparison. No instrumented physical
Safari/iPhone performance measurements were collected; the owner gameplay trial is qualitative.
Environment Lab offers A and B after generating or importing a world. Select **Zoned blend**
when reviewing the approved island materials. The full campaign preview is available at
`/fjord-play` (B by default), or explicitly `/fjord-play?terrain-study=smooth`.
Use `/fjord-play?terrain-study=baseline` to compare A.

## B: shared heightfield normals

Preparation sums the area-weighted normals of the existing canonical adjacent triangles at
heightfield corners. Every duplicate grassy/soil vertex uses the same normalized corner vector.
The duplicate vertex layout, alternating diagonals, XYZ, indices, source UVs, mask UVs and
six-layer ground stack remain unchanged. Native material clones use `flatShading: false`;
source materials and character/house props retain their existing flags. The optional climate
snow candidate follows the selected terrain flag too.

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

The selected shading mode is ephemeral. It is absent from the exported WorldBlueprint and
campaign save. Existing saves retain their canonical terrain. Switching A/B in the Lab prepares
a replacement mesh asynchronously while the old mesh stays visible. The latest request wins;
stale meshes are disposed. Returning to the reference scene invalidates pending replacements.
Normal, colour, roughness, rock-axis and seasonal material behavior use the existing renderer.

## Reproduce

- `node --test tests/terrain-shading-study.test.mjs`
- `node scripts/qa/check-terrain-default.mjs` against the normal production build on 5180.
- Run the normal Vite development server on 5193, then `node scripts/qa/check-terrain-shading.mjs`.
- Run the existing QA-only server with `QA_PORT=5194`, then
  `node scripts/qa/measure-terrain-shading.mjs`. PowerShell users set environment variables with
  `$env:QA_PORT='5194'` before starting `scripts/qa/fjord-runtime-server.mjs`.
- Generate the review after copying the successful evidence into `docs/qa/terrain-shading`:
  `node scripts/qa/report-terrain-shading.mjs`.

The QA bridge is injected only by the isolated QA server and is absent from normal builds.
See [the measured review](qa/terrain-shading/report.md). B is approved after the image review and owner gameplay trial. The default-selection change
does not alter the measured normal algorithm or the quantitative evidence above.
