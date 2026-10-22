# Island campaigns in /fjord-play

## Default and identity

The [#240 geography survey](qa/island-seed-expansion/report.md) preserves the original offline measurements.
The owner approved all eight shortlisted additions. The separate
[promotion and permanent-snow review](qa/island-snow-promotion/report.md) records their integration checks.

New campaigns created in `/fjord-play` use `island-pool-v3`. The ordered pool is **18, 7, 15, 79, 88, 101, 112, 168, 195, 227**. A pinned integer hash selects one geography from the campaign seed; v3 adds a final xor-shift before the modulo-ten selection. Fresh random campaign seeds can select any of the ten islands, including repeating a previous island. This is not a no-repeat shuffle. The Simulation Core keeps its original seed, founders, rules, RNG, events and resources. The geography seed is displayed separately under **Menu → Campaign**.

All ten entries use the existing `fjordside-island-v0.3e-r3` generator, the canonical 800 × 800 m heightfield, its geological compartments and the existing environment-zoning function. There is no random retry or silent seed substitution inside the generator. Changing this pool, selection mapping or preparation algorithm after release requires a new recipe version. Fjord Play loads only the selected, prepared island; it does not rerun that generator on the player's device. The shared world cache retains at most two recently used versions/geographies.

The v2 recipe keeps the same terrain, foundations, berth, asset families and tree quotas, and composes a bounded share of trees into mixed-size village-edge groups. It reserves every future household plot and carves navigation from the actual new placements. Existing `island-pool-v1` saves reconstruct their original trees and navigation byte for byte; the two versions have separate worker/cache identities. See [village nature composition](VILLAGE-NATURE-203.md).

V3 reuses that same preparation and village-nature treatment. V1 and v2 retain their original ordered **18, 7** pools and hash mapping. An existing save or same-founders restart never upgrades its recipe implicitly; only an explicitly new campaign uses v3.

Existing campaign saves retain their original geography. A same-founders restart also retains that geography. **New campaign from seed** in the Fjord menu explicitly creates an island campaign. A transferred 2D campaign preserves whichever geography it already owns; a fresh standalone 2D campaign retains its existing behavior.

## Real campaign capacity

The Lab's six authored demonstration parcels remain a separate validation contract. A successful six-parcel layout alone is not a founding-campaign proof. The curated source islands still pass that original validation, including the rival region.

The campaign adapter replaces the player's six demonstration foundations with reservations for actual **15 × 15 m** household plots and a campfire. It restores the player's natural heightfield before grading the real foundations; the rival foundations remain reserved. The runtime terrain, height queries, nature, navigation and rendering all consume this single prepared WorldBlueprint. Original generator outputs are not mutated.

The search examines a bounded extension of the original natural pocket (40 m on each side), uses the existing dry/slope limits, and rejects any foundation requiring more than **0.6 m** of cut or fill. Full support triangles take precedence over neighboring feathered edges. Each plot is locally leveled; no settlement-wide elevation or island silhouette is imposed. The campfire is selected on supported terrain near the original pocket, rather than at the middle of an arbitrary bounding rectangle.

The table below records the original v1 access measurements. V2 retains the same foundations, grading, separation and berth; route lengths are recomputed around its own trees and must pass the same access constraints.

| Geography seed | Reserved home plots | Maximum terrain adjustment | Gap to rival reserve | Center separation | Landing → rival walk |
| --- | ---: | ---: | ---: | ---: | ---: |
| 18 | 12 | 0.5834 m | 180.2 m | 328.6 m | 776 m |
| 7 | 13 | 0.5972 m | 42.8 m | 197.4 m | 270 m |

Both are checked with ten independent founder households, all ten house conversions, a Farmyard, assigned cattle and a Longhouse upgrade. House plots remain in place and permanent homes receive connecting paths. Tents retain grass and create no dirt paths. The finite reserved capacity is shown in the menu; this is not a promise of indefinite settlement expansion or support for every larger authored Farmyard terrain variant.

The adapter also checks the original 160 m center separation, 40 m construction gap, 240 m rival access route and full-hull water depth. Terrain-only invisibility is not required. The existing discovery fog and observed rival presentation remain active; scenery follows geographical facts and does not expose private rival household data.

## Presentation

Island campaigns use the approved zoned native materials, source atlases and cool-grey rock treatment from #137. The existing zoning fields remain the only classifier; fields are computed with that same function after local grading during offline preparation. The prepared file contains this one canonical blueprint; no second terrain/classifier is introduced into the running world or campaign save.

Permanent summit snow is a presentation cap on gentle upper terrain: `waterLevel + 0.90 × (peakHeight − waterLevel) − 5 metres`, with the existing minimum upward normal of **0.97**. This lowers the previous cap by exactly five metres on all ten islands, including existing v1/v2 campaigns, without changing their saved terrain, climate zoning or seasonal transitions. Steep rock faces retain their exposed material. This game-scale visual treatment is separate from the climate-dependent `snowRetentionPotential` field; no additional biome classifier or snow array is saved.

The existing ReferenceWater, EZ-Tree/KayKit assets, seasonal tints, character shaping, selection and Living World Controller remain in use. The ship uses the validated full-size berth; the actual source pier sits parallel beside it with a supported shore end. The camera follows actual terrain height, frames the inhabited area and supports the island extent. Atmospheric fog distance compensates for the higher overview camera; seasonal and annual weather treatment remains active. This atmospheric effect is not exploration concealment.

## Persistence and failure behavior

Island campaigns export **bridgeVersion 2** with the pinned island recipe and existing canonical campaign, narrative, presentation layout and selection. They do not store a second 18 MB blueprint or derived biome/navigation arrays. Browser loading reads the matching prepared blueprint, validates the layout's geography identity, and rejects incompatible recipes or unsafe placements. Full legacy blueprints in bridgeVersion 1 remain supported unchanged.

Local saves and 2D ↔ 3D handoffs use this same compact format. Import/new/restart prepare and validate a proposal before committing canonical state. Browser preparation runs in an owned worker before the campaign clock starts. A missing, stale or corrupt prepared island reports an error with retry/back recovery; there is no silent procedural fallback or seed substitution. Headless APIs and the Environment Lab retain procedural generation. No hard frame-time acceptance threshold was introduced.

See [browser evidence and QA](qa/fjord-island/report.md). Historical capacity, terrain and material measurement reports retain their original scope and values.

## Summer founding start (#157)

New Fjord 3D campaigns explicitly select `summer-800-v1`: Summer 800, tick 500, initialized directly with 15 Food and 5 Materials. The first full annual reckoning follows after 500 played ticks, with unchanged annual consumption and risk rules. Headless/standalone 2D defaults and existing saves retain their original time. Both Fjord restart choices use the selected phase; no pre-simulation is performed. The owner approved this as the new Fjord default on 2026-10-13. See [Summer founding rules, compatibility and QA](SUMMER-800-START.md).

## New campaign loading

New and restarted Fjord campaigns use [responsive worker loading and a top-down arrival](RESPONSIVE-ISLAND-LOADING.md). The existing pinned island recipe and Summer founding state remain authoritative; loading contributes no simulation ticks.

## Prepared publications (#259 follow-up)

`pnpm assets:islands` generates the complete final world and campaign plan offline for all ten
current islands and both historical two-island pools. Publications include the exact heightfield,
foundations, coastline, geology, environment fields, vegetation, navigation, plots and berth.
Content-addressed gzip files are approximately 2.5–2.8 MB each, requested individually. They preserve
the canonical JSON at full numeric precision; they are not a simplified silhouette or lower LOD.
The device still constructs native render geometry/material masks and performs GPU preparation.

`BakedIslandCatalog.ts` pins compressed hashes, original sizes, canonical hashes and all transitive
generator source inputs. Public-asset validation rejects missing files, changed bytes or stale
inputs. Changes to generation dependencies require regenerating these publications; rules/output
changes still require the normal recipe/version review. The worker verifies compressed identity,
inflates with an exact size bound, adopts the unchanged recipe and sends the canonical proposal
once. Temporary compressed/text buffers leave with the worker; no whole-pool runtime cache is added.

Character DNA/faces, names and Core seeds remain unique. `pnpm assets:character-sources` prepares
lossless compressed versions of the shared native world body, clips and supported wardrobe sources.
The build validates their original bytes against existing source identities; the browser validates
the compressed identity before unpacking those exact bytes. Existing factory caches still share
each decoded source, while every resident owns its skeleton, materials, fitted geometry and mixer.
This does not preselect generic people, change source LOD, skip fitting or alter a saved identity.
Unpublished Lab sources and injected test loaders retain their original verification path.
