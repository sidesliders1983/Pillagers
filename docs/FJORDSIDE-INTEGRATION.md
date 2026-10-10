# Fjordside integration v0.2

Ordinary Fjordside now generates a fresh Fjord world with a random seed immediately on each load. This startup change was approved on 9 October 2026. Use `/?world=reference` for the original Reference scene. Open `/?worldDev=1` and choose Development tools → Debug for explicit generation and geography save/load. Promoting generated startup does not imply full Northstar visual parity.

## Creation, save/load and rollback

Ordinary startup and Generate World run the pinned generator. The production World factory consumes a complete validated WorldBlueprint; it never invokes generateWorld. In development mode, reload reads the stored blueprint and attachment plan, preserving terrain, biomes, nature, settlement and routes. An ordinary reload creates a fresh world. Quality changes switch live water, DPR and shadows without resetting time or geography. Ground maps keep their loaded tier until scene reload.

The active preview uses sessionStorage key `pillagers-fjordside-active-v02`. Save/Load uses localStorage key `pillagers-fjordside-geography-v02`, separate from Simulation Core campaign saves. Export/Import stores complete geography and original source attachment placements. Existing Environment Lab world files are importable. Invalid files or changed source bounds visibly reject activation. Reference fallback stores an explicit Reference selection and retains the local save. Ordinary URLs ignore preview selection and generate a fresh world; `?world=reference` is the explicit rollback.

These saves do not add persistence for the existing Fjordside character preview or annual clock: reload retains its previous initialization behavior. Headless simulation economy, mortality, cattle, weather and expeditions are unchanged.

## Shared production contracts

- WorldFactory uses BlueprintTerrain, WorldGroundMaterials, the approved ReferenceWater adapter, PlaceSettlement, KayKitNature and the shared PineModels loader. Environment Lab continues sharing terrain/nature modules and retains its boona13 FjordWater adapter.
- Canonical terrain triangles govern raycasting, camera navigation and resident heights. The selected water uses its rendered geometric waves for boat support; it no longer uses a depth mask. Existing MovementSystem steering, private RNG and Walk/Talk/Listen remain intact.
- Six original Meshy parcels preserve authored geometry, farmyard floors, fences and scale. Twenty original props remain: storehouse, hearth, well, two log piles, three crates, four barrels, fish rack, runestone, pier, boat and four coastal cliffs.
- Ground prop placement measures rotated source boxes including overhangs and reserves routes, Meshy footprints and nature. Foundations sample nine dry/flat support points. Resident movement excludes actual prop boxes. Harbor decorations use the validated coast approach and shared water level; cliff roots embed 0.15m.
- New worlds append the owner-approved hollow Meshy tent as the twenty-first attachment (`authored-props-v4`, compact scale 1.50m tall and at most 2m along either ground axis). Its separate building plot reserves at least 6 × 6m for a future Hut, including measured Hut overhangs and at least 0.75m working space per side. Houses, farmyards, props, nature and routes leave that plot free. Reference fallback uses the same plot sizing and nature filter. Actual rendered grass/vegetation extents are removed once at startup without editing the stored blueprint or consuming RNG. Resident clearance still follows the compact tent box plus 0.65m, allowing movement through the surrounding working space.
- Attachment versions and placements are saved. Existing `authored-props-v1` files retain their original twenty props (or the original Reference scene) and export unchanged. Initial v2 and compact v3 tent previews validate against their original measured bounds and plan, then migrate only the tent to the new house-sized plot and export as v4. Geography and the other twenty placements remain unchanged; v4 round-trips reproduce the plot. Arbitrary source/placement mismatches still reject activation. This stays separate from the existing generator schema.
- Development review cameras include Tent close-up and Tent interior. Older worlds without a tent disable these choices. See [the tent asset and verification](MESHY-TENT-INTEGRATION.md).
- Camera bounds/home and lighting/hearth anchors follow the selected world. Existing lighting defaults remain; low-sun/HDR pilots are not silently promoted. Generated shadow coverage follows larger geography; Low caps shadows at 1024 and DPR at 1.
- Existing seasonal treatment supports all four native ground layers and composes with sourced leaf wind. Annual aging continues automatically without a summary popup or automatic pause. Manual Pause holds residents, time, water, wind and animated lighting without resetting the year.
- World-owned masks/materials, textures, wind clones, pine source, water and instancing have teardown; camera listeners are aborted. Original AssetManager resources remain shared until final disposal.

## Water and wind pass

Fjordside now uses the approved ReferenceWater defaults and four-point original-boat flotation from #75. See [the current water contract](FJORDSIDE-WATER.md). Environment Lab retains the boona13 source; its earlier tuning and measurements remain historical records.

EZ-Tree wind reuses the pinned `dcf309bd86bd521083d9c70f01f2de45fdc7c457` callback and MIT notices. The sole GLSL compatibility insertion is native instanceMatrix projection. Published strength/frequency are tuned; trunks, roots and placement remain static. Material clones share source geometry/textures; no per-frame tree rebuild or RNG draw occurs. See [adapter provenance](../src/vendor/ez-tree/README.md). Pause waves & wind freezes both in the Lab; production preview controls freeze them separately.

## Readiness and limits

See [real-world QA](qa/fjordside-integration-v02/report.md). Reference is the original production rollback baseline, not the single-resident Lab reference. Performance comparisons use ten residents throughout and remain diagnostic on the owner's old laptop.

Fjordside water has geometric waves and sky highlights, but no real house/tree/boat reflections, depth mask, refraction or shoreline foam. Leaf shadow silhouettes remain static as in the upstream source. Compact composition, backdrop and Northstar owner approval remain open. Automated checks do not grant that approval.
