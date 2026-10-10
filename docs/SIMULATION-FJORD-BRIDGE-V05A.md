# Simulation-to-Fjord bridge v0.5A

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

## Implemented integration boundary

A small projection accepts a canonical snapshot plus existing Fjord geography and returns stable render descriptors: canonical kind/ID, asset selection, metric transform, current visual status and a selection identity. It does not issue commands, draw random numbers from the core or edit the snapshot.

Expose `/fjord-play` with a founding campaign, time controls and explicit shared campaign save/load. Preserve `/`, `/play`, `/gameplay-lab`, `/environment-lab` and existing debug URLs. Do not implement the v0.5B context-panel command UI here; construction/occupation/cattle scenarios can be prepared in Gameplay Lab and explicitly loaded into Fjord.

Placement records belong to a versioned presentation adapter, separate from canonical JSON. Retain occupied/vacant plot identities across incremental changes; building identity keeps its own location when a household moves. Reserve a suitable foundation using existing footprint conventions, and clear source nature through BuildingPlot. Save geography and presentation alongside canonical export without changing Simulation Core schema; also accept plain canonical saves. Any location or asset fallback must be visible in developer diagnostics.

## Approved verification boundaries

1. Public projection over real canonical commands: founding household tents, ten residents, three cattle and one ship; building/upgrade/Farmyard mapping; living-only updates; dry collision-free metric placement; stable incremental identities; save/load; renderer removal leaves replay identical.
2. Browser/visual smoke: new route on desktop and iPad-sized viewports, real asset loading or declared fallbacks, Winter advance, paused load, persistence and screenshots. Retain existing route checks. Physical iPad GPU validation remains an owner check; local timings are diagnostic on this old laptop.

No gameplay rules or balance defaults are changed. The original inventory was merged in PR #91; the implementation follows the owner's issue #87 comment and approved projection/browser seams.

## Campaign and geography persistence

`FjordCampaign` wraps the existing GameplaySession. The scene never owns a second simulation, RNG or annual scheduler. Canonical commands, time, stocks, partnerships, mortality and expeditions remain authoritative in Simulation Core.

A Fjord envelope contains bridge version 1, the full canonical campaign, the exact validated WorldBlueprint, generator/version/seed identity, metre-based layout version 1, the bound source mooring and selection identity. It is validated before the current campaign is replaced; failed imports are atomic. Refresh restores the envelope paused, without regenerating geography. Restart with the same founders retains that geography and mooring.

`pillagers.gameplay-lab.v1` remains plain canonical JSON shared by both existing gameplay routes.
`pillagers.fjord-play.v1` is its separate optional presentation sidecar;
`pillagers.fjord-play.active.v1` is session storage for refresh. Save writes both local records. Load is explicit: updated canonical data is paired with a same-seed sidecar, or imported on the current same-seed geography. A different seed without a sidecar uses the pinned generator. Export canonical JSON remains available before assets finish loading; combined Fjord export waits for the mooring to resolve. Cross-route live switching is reserved for #88.

## Physical plots, grass, soil and paths

Household tents reserve dry, flat, disjoint 13m parcels. Those parcels are presentation reservations and do not create soil: tent-only campaigns have grass, with no example settlement dirt or paths. Building a permanent home replaces the original household tent at its existing plot. The physical building ID then owns that location through household transfers, vacancy, upgrades and Farmyard activation/deactivation.

Only actual permanent buildings add soil around their parcels. Two or more permanent homes gain deterministic connecting paths over authoritative dry terrain, using the existing walking slope/elevation limits and avoiding tent and building parcels. Tent parcels retain grass. Paths are presentation only; they add no movement, production or gameplay rules. Salvage removes that building's soil and its connections. A vacant existing house keeps its soil. Updates change the native material's soil alpha map in place; the saved terrain triangles and biome records remain unchanged. If no safe connection is found, diagnostics report it rather than fabricating a route across water.

People and animals have stable keyed outdoor positions, clear actual nature bounds, and inherit canonical age, stage, sex and assignment. New arrivals do not reshuffle survivors. Dead/away residents and dead/slaughtered animals leave the active scene while canonical history stays intact. No CPU settlement is rendered.

## Source assets and declared fallbacks

| Presentation | Source / mapping |
| --- | --- |
| Temporary household | Approved compact Meshy tent at metre scale |
| House levels 0–3 | Existing Hut, Homestead, Longhouse, Great Hall |
| Farmyard level 0 | Existing FarmHut plus FarmHutTerrain |
| Farmyard level 1 | Existing FarmHomestead with nearest safe FarmHutTerrain; the 17m×18.6m FarmHomestead terrain exceeds the reserved plot and is explicitly diagnosed |
| Farmyard levels 2–3 | Actual Longhouse/Great Hall retained; lightweight yard marker with an explicit missing-source-variant diagnostic |
| Resident | Existing static Human_LOD2 body normalized to 1.8m; child scale 0.6 below 16 Winters; canonical age/sex metadata. Unique clothing, hair and DNA appearance are outside this slice |
| Cattle | Existing prepared baby, young-adult, adult-female and adult-male GLBs/manifests |
| Founding vessel | Real longship-drakkar source at the existing factory's coastal mooring, persisted once |

Unavailable GLBs/manifests receive explicit metric placeholders. Ground maps and EZ-Tree have native/KayKit fallbacks. No safe remaining plot or outdoor position produces a retained selectable identity and diagnostic without a mesh. Rendering or asset failures do not change Simulation Core results or prevent time commands and canonical save/export. Existing prototype routes retain strict source validation; validation rules have not been weakened.

See [the implementation QA report](qa/simulation-fjord-bridge/report.md) for checks, images and limitations.

## Interactive follow-up

Issue #88 adds the shared management panels, explicit 2D/3D session handoff and relationship selection markers. See [Interactive Fjord settlement v0.5B](INTERACTIVE-FJORD-SETTLEMENT-V05B.md). The v0.5A notes and measurement report above record the original bridge scope.
