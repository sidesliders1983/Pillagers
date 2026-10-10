# Simulation-to-Fjord bridge v0.5A — architecture inventory

Issue: #87. Inspected base: `5ca0c0b` (main, including the compact Meshy tent from #90).

## Existing authorities and reusable systems

| Responsibility | Exact source paths | Reuse / constraint |
| --- | --- | --- |
| Canonical campaign, commands, replay, save | `src/simulation/SimulationCore.ts`, `Landing.ts`, `Mechanics.ts`, `Farmyards.ts`, `Livestock.ts`, `Weather.ts`, `WorldExpeditions.ts` | Only the core owns residents, households, building levels, cattle, resources, time and RNG. Use public inspection APIs. Do not render CPU settlements. |
| Browser campaign pacing | `src/gameplay-lab/GameplaySession.ts` | Reuse paused startup, canonical commands, pacing and import/export. No second annual clock. |
| 2D identity / presentation | `src/play/SettlementView.ts`, `PlayUI.ts` | Reuse EntityKind, household membership, living/away filtering and canonical inspections. Its isometric coordinates are unsuitable for a metric terrain; do not copy them. |
| Geography / validation | `src/world-generation/GenerateWorld.ts`, `WorldBlueprint.ts`, `TerrainQueries.ts`, `PlanSettlement.ts`, `WorldSave.ts` | Use the pinned generator and stored validated triangles. No parallel terrain generator. |
| Production environment | `src/world/WorldFactory.ts`, `BlueprintTerrain.ts`, `WorldGroundMaterials.ts`, `KayKitNature.ts`, `PineModels.ts`, `NatureWind.ts` | Add an explicit canonical-settlement option to the existing factory; suppress prototype houses, tent and decorative boat on this route only. Preserve standalone prototype and debug modes. |
| Plot / collision / foundation | `src/world/BuildingPlot.ts`, `SettlementLayout.ts`, `PlaceSettlement.ts`, `WorldAttachments.ts` | Reuse source footprint conventions, nine-point dry/flat fit and actual rendered-instance nature clearing. Preserve the existing coast/mooring anchor. Buildings and Farmyard floors use the existing authored parcel placement. |
| Metric assets | `src/core/AssetManager.ts`, `src/config/HousingAssets.ts` | Loaded houses are centred and grounded; normal source scale is 1 metre per Three.js unit. Hut, Homestead, Longhouse and Great House are already available. FarmHut and FarmHomestead have existing yard terrain. Higher Farmyard variants need an explicit nearest-safe fallback diagnostic. |
| Tent | `public/scenery/meshy-tent-v1/manifest.json`, `tent.glb`, `docs/MESHY-TENT-INTEGRATION.md` | Real approved 1.50m-high tent, approximately 1.88m by 2m footprint. One tent per occupied temporary household. No new model pipeline. |
| Human | `public/game-assets/human/Human_LOD2.glb`, `src/characters/MeshyHuman.ts`, `UniversalHumanProfile.ts` | Existing static body and SkeletonUtils cloning. Unique appearance, outfits and animation are excluded. Present explicit shared-body status, age/sex remain canonical metadata. |
| Cattle | `public/game-assets/cattle/{adult-female,adult-male,baby,young-adult}/`, `scripts/cattle-rigs.json`, `prepare-meshy-cow.mjs` | Actual prepared stage/sex GLBs with individual manifests and source scale/withers metadata. Static clones suffice; no locomotion. |
| Vessel | `Assets/Terrain/longship-drakkar.glb`, `src/world/WorldAttachments.ts`, `FjordsideWater.ts`, `BoatFloat.ts` | Use the existing mooring, approved water and metric vessel. Do not relabel the prototype faering as a real longship without a fallback diagnostic. |
| Camera / light | `src/camera/RTSCameraController.ts`, `core/Renderer.ts`, `core/WorldLighting.ts` | Reuse mouse/touch navigation, terrain snapping, low quality and approved lighting; no custom shader work. |
| Existing saves | `src/gameplay-lab/GameplayLab.ts`, `src/play/PlayUI.ts` | Both use `pillagers.gameplay-lab.v1` for canonical JSON. Keep that contract importable and exportable. Geography/presentation is separate from simulation truth. |

## Proposed integration boundary

A small projection accepts a canonical snapshot plus existing Fjord geography and returns stable render descriptors: canonical kind/ID, asset selection, metric transform, current visual status and a selection identity. It does not issue commands, draw random numbers from the core or edit the snapshot.

Expose `/fjord-play` with a founding campaign, time controls and explicit shared campaign save/load. Preserve `/`, `/play`, `/gameplay-lab`, `/environment-lab` and existing debug URLs. Do not implement the v0.5B context-panel command UI here; construction/occupation/cattle scenarios can be prepared in Gameplay Lab and explicitly loaded into Fjord.

Placement records belong to a versioned presentation adapter, separate from canonical JSON. Retain occupied/vacant plot identities across incremental changes; building identity keeps its own location when a household moves. Reserve a suitable foundation using existing footprint conventions, and clear source nature through BuildingPlot. Save geography and presentation alongside canonical export without changing Simulation Core schema; also accept plain canonical saves. Any location or asset fallback must be visible in developer diagnostics.

## Verification plan (awaiting seam confirmation)

1. Public projection over real canonical commands: founding household tents, ten residents, three cattle and one ship; building/upgrade/Farmyard mapping; living-only updates; dry collision-free metric placement; stable incremental identities; save/load; renderer removal leaves replay identical.
2. Browser/visual smoke: new route on desktop and iPad-sized viewports, real asset loading or declared fallbacks, Winter advance, paused load, persistence and screenshots. Retain existing route checks. Physical iPad GPU validation remains an owner check; local timings are diagnostic on this old laptop.

No gameplay rules or balance defaults are changed. No architecture or production implementation has been changed at this inventory stage.
