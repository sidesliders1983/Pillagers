# Gameplay spatial queries v1 — issue #136

`createWorldSpatialQueries(world)` is a derived, renderer-free view of an existing WorldBlueprint. It adds no fields to the blueprint and changes neither generator nor save versions. The physical terrain, canonical zoning, scenery reservations, navigation and site visibility evidence remain authoritative.

## API and units

- `grid`: the existing navigation lattice (currently **1 m**; terrain vertices are 2 m, zoning samples 4 m). No second grid of persistent values is created.
- `sample(x, z)`: exact world-space point in metres, or `null` outside the closed navigation bounds. Non-finite coordinates throw. Cell identity uses nearest navigation node; half-cell ties select the positive axis. Boundary cells are clipped to the world bounds.
- `cell(index)`: samples that navigation node's centre; invalid/non-integer indices return `null`. `spatial-v1:row:column` IDs are stable **within a blueprint**, not globally unique between worlds.
- `surface`: height and elevation above water in metres, physical water at `height <= waterLevel`, exact rendered-triangle slope in m/m and degrees, downhill aspect in degrees (0 = +Z/north, 90 = +X/east). Slopes below 0.001 m/m have `null` aspect. Triangle-edge ties follow the canonical height query.
- `zone`: unchanged `sampleEnvironment` output: canonical primary ground/region, grass/sand/mud/rock influences, moisture, shelter, forest cover and snow-retention potential. No new thresholds, noise or biome classifier. A missing zoning extension returns `null`; old worlds are not regenerated or silently zoned.
- `zoneWaterMismatch`: reports disagreement between nearest 4 m ground membership and exact triangle water state near the coast. The coarse label is retained; physical height governs water and clearance. This is not a new ground class. It is `null` without zoning.
- `placementSlope`: the existing symmetric finite-difference slope probe used by placement and resident steering. It can differ from the exact triangle slope at ridges and triangle boundaries.
- `movement`: existing resident traversability and explanatory reasons. Uses saved navigation, >0.2 m water clearance, existing slope <=0.55 m/m, building clearance >=0.65 m and existing scenery clearance. No cost multiplier is invented. Rock, forest, snow or moisture labels alone do not change permission.
- `buildability.terrainSuitable`: conservative **point preflight**, requiring elevation >=0.25 m and both exact triangle and inherited placement slopes <=0.12 m/m. This does not approve a whole building/farmyard footprint or flatten terrain.
- `buildability.available`: additionally excludes saved navigation blocks, scenery and all reservations below. Reserved player land is deliberately unavailable to *unassigned infrastructure*, not forbidden to the player's own future settlement allocation. Existing building commands, parcel validation and limited foundation grading remain unchanged.
- `reservations`: player/rival site envelopes and foundations, neutral buffers outside those envelopes, access paths (including landing access), rival connection, harbor berth and landing-to-berth approach. Route corridors reuse 0.65 m resident clearance. Complete new infrastructure footprints must still check their whole extent, not only the centre point.
- `navigationReport()`: explicitly reruns the existing scenery-aware validator, including reserved landing/building approaches and rival connection. Returns inherited seed rejection reasons too. No second connectivity model, visibility solver or route planner is introduced.

## Storage and cost

Queries retain a sparse 16 m broad-phase object/route index. Its size follows the number of existing props, parcels and route segments, not the number of terrain cells. All terrain/zoning values are sampled on demand. `storage` reports shape, bucket and reference counts; `serializedBytes` is always zero. There is no full derived height/slope/aspect/buildability array or persistent cache.

Environment Lab has a collapsed **Spatial grid · inspect a point** inspector and six `Grid · ...` overlays. The native nearest-filtered debug texture displays the actual 1 m cells, using the existing terrain UV channel. At 801×801 it allocates 2,566,404 bytes of pixel data, plus the corresponding GPU texture; one overlay is retained and disposed on replacement. It is constructed on overlay selection, never per frame. Source materials do not allocate this texture. Existing forest, rock and snow overlays continue to consume #135 fields.

A full debug overlay can briefly block the Lab while its cells are sampled; this is a diagnostic cost, not gameplay work. Measurements and browser limitations are recorded in [the QA report](qa/world-spatial-queries/report.md).

## Boundaries for #137

Use `zone` and the existing stored zoning fields for ground blending and cover. Do not add a second classification system or serialize values that can be derived from the heightfield. Existing climate-calibrated snow potential is metadata, not an altitude-only snowline or movement rule.

The repeating rock/ground texture problem remains a material/UV problem for #137. Evaluate the approved source materials, mapping on steep faces, texture transforms and native material composition. Adding geometric noise to disguise repeated textures is not an acceptable fix. #136 changes no source material, terrain shape, gameplay cost or renderer technology.
