# Fjordside integration v0.2

Ordinary Fjordside remains the original Reference scene. Open `/?worldDev=1` and choose Development tools → Debug for the staged integration controls. Generated is an explicit geography choice. This does not grant Northstar visual approval or switch the default.

## Creation, save/load and rollback

Generate World runs the pinned generator only on that explicit action. The production World factory consumes a complete validated WorldBlueprint; it never invokes generateWorld. Reload reads the stored blueprint and attachment plan, preserving terrain, biomes, nature, settlement and routes. Quality changes rebuild render resources from that same blueprint.

The active preview uses sessionStorage key `pillagers-fjordside-active-v02`. Save/Load uses localStorage key `pillagers-fjordside-geography-v02`, separate from Simulation Core campaign saves. Export/Import stores complete geography and original source attachment placements. Existing Environment Lab world files are importable. Invalid files or changed source bounds visibly reject activation. Reference fallback clears the active preview and retains the explicit local save. Ordinary URLs ignore preview selection.

These saves do not add persistence for the existing Fjordside character preview or annual clock: reload retains its previous initialization behavior. Headless simulation economy, mortality, cattle, weather and expeditions are unchanged.

## Shared production contracts

- WorldFactory uses BlueprintTerrain, WorldGroundMaterials, FjordWater, PlaceSettlement, KayKitNature and the shared PineModels loader. Environment Lab continues using those modules.
- Canonical terrain triangles govern raycasting, water depth, camera navigation and resident heights. Existing MovementSystem steering, private RNG and Walk/Talk/Listen remain intact.
- Six original Meshy parcels preserve authored geometry, farmyard floors, fences and scale. Twenty additional original props remain: storehouse, hearth, well, two log piles, three crates, four barrels, fish rack, runestone, pier, boat and four coastal cliffs.
- Ground prop placement measures rotated source boxes including overhangs and reserves routes, Meshy footprints and nature. Foundations sample nine dry/flat support points. Resident movement excludes actual prop boxes. Harbor decorations use the validated coast approach and shared water level; cliff roots embed 0.15m.
- Attachment version `authored-props-v1` and placements are saved. A mismatch rejects activation instead of silently changing stored locations. This stays separate from the existing generator schema.
- Camera bounds/home and lighting/hearth anchors follow the selected world. Existing lighting defaults remain; low-sun/HDR pilots are not silently promoted. Generated shadow coverage follows larger geography; Low caps shadows at 1024 and DPR at 1.
- Existing seasonal treatment supports all four native ground layers and composes with sourced leaf wind. Annual aging and Continue remain. Manual Pause holds residents, time, water, wind and animated lighting without resetting the year.
- World-owned masks/materials, textures, wind clones, pine source, water and instancing have teardown; camera listeners are aborted. Original AssetManager resources remain shared until final disposal.

## Water and wind pass

boona13 water remains revision `97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159`; its water/noise/foam GLSL remains unchanged. The adapter adds only native Three.js fog chunks and uniforms so distant water joins the existing atmosphere. Published flow speed is 1.5 (previously 0.18), ripple boost 6 (3), specular power/intensity 64/0.3 (128/0.045), sky reflection strength 0.12 (0.08) and shore glow 0.025 (0.015). Depth/mask and Standard/Low tessellation remain: vertex-sampled shore masks make aggressive tessellation reduction unsafe. Reusing day/night colour objects removes two Color allocations per frame. This improves visibility; no isolated FPS gain is claimed.

EZ-Tree wind reuses the pinned `dcf309bd86bd521083d9c70f01f2de45fdc7c457` callback and MIT notices. The sole GLSL compatibility insertion is native instanceMatrix projection. Published strength/frequency are tuned; trunks, roots and placement remain static. Material clones share source geometry/textures; no per-frame tree rebuild or RNG draw occurs. See [adapter provenance](../src/vendor/ez-tree/README.md). Pause waves & wind freezes both in the Lab; production preview controls freeze them separately.

## Readiness and limits

See [real-world QA](qa/fjordside-integration-v02/report.md). Reference is the original production rollback baseline, not the single-resident Lab reference. Performance comparisons use ten residents throughout and remain diagnostic on the owner's old laptop.

Water has sky highlights, not house/tree reflections or physical wave displacement. Leaf shadow silhouettes remain static as in the upstream source. Compact composition, backdrop and Northstar owner approval remain open. Automated checks do not grant that approval.
