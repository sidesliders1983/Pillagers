# Macro Island Shape v0.3b

Issue #133 adds **Nordic Island · v0.3b** to Environment Lab. It uses a deterministic, process-inspired sequence based on older Icelandic glacial landscapes. See [the research and its limits](NORDIC-ISLAND-LANDFORMS.md). Existing Fjordside/campaign presets and stored worlds retain their geography.

## Review

In `/environment-lab`, expand **Settings**, select **Nordic Island · v0.3b**, enter a seed, then **Generate World**. Disable Nature and Meshy village before inspecting form. Compare **Island overhead** with **Elevation**, then **Island oblique** with **Bare terrain form**. Both use the canonical mesh without ground textures. **Source materials** restores the approved materials. **Macro regions & coast** adds the physical coastline, measured natural pockets, ridge crest and a terrain-only connecting route.

The gold line follows the triangle/water intersection. Yellow and pink outlines follow the sampled usable cells of two irregular lowland pockets. Their bounding boxes do not imply flat rectangular platforms. The orange cross marks a measured intervening ridge and cyan marks a traversable connection. No houses, residents or second clan are placed by the island proposal. Final settlement selection, house fitting, hiddenness, reservations and line-of-sight checks remain #134.

Rejected proposals keep their requested seed and explicit reasons. There is no hidden retry with another seed. They can still be inspected and exported.

## Canonical formation and scale

| Contract | Existing fjord presets | Nordic Island |
| --- | --- | --- |
| Generator version | `fjordside-v0.1` | `fjordside-island-v0.3b` |
| Extent | 180 x 180m | 800 x 800m |
| Heightfield | 91 x 91 | 401 x 401 |
| Physical spacing | 2m | 2m |
| Navigation grid | 181 x 181 at 1m | 801 x 801 at 1m |
| Save | Full blueprint, schema 1 | Full blueprint plus `rift-glacial-v1` formation evidence |

Only part of the map is dry land. Models and paths keep their metre units. The field is built from elongated volcanic accumulation zones, then eroded through a drainage network derived from that field. The final sea level floods the lowered valleys. Surviving ground forms the ridges. Coastal benches use a continuous elevation transform; site measurements do not reshape terrain.

The stored `geology` record contains the rift segments and drainage paths, widths, descending pre-deposition floor profiles, and parent links. It is evidence of generation, not a second runtime terrain sampler. The final `terrain.heights` remains authoritative for all queries, raycasts, coast extraction, walking and rendering. Import validates bounded metadata and loads the stored field without rerunning formation.

## Physical diagnostics

`createMacroQueries(world).sample(x, z)` returns triangle height/slope, signed exact coast distance, water depth and a coarse region tag. Sea is at/below water; shore is within 5m; highland starts at 16m. Valley diagnostics look for low terrain below 7m, over 14m inland, between higher ground along one of four opposing directions. Other ground is lowland through 6m, then upland. These labels do not replace saved biomes.

`inspectMacroIsland` verifies:

- One cardinally connected landmass and a three-sample deep-sea margin.
- Lowland, valley and highland presence, with at least two main drainage valleys.
- No more than 85% occupancy of the coastline's convex hull: meaningful inlet incision is required.
- Rotational dry-mask overlap below 90% for orders 3, 4, 5, 6 and 8, screening out obvious radial stars/circles.
- Two non-overlapping natural pockets at least 120m apart. A bounded 20m anchor scan measures connected cells within 55m of each anchor; each pocket needs at least 3,000m², elevation at least 0.25m above water, and sampled slope at most 0.12m/m. Each anchor is within 65m of the physical coast. These are coarse feasibility samples, not final foundations.
- A continuous rise at least 8m above both anchors and at least 12m wide between the pockets. Vegetation and distance alone never qualify.
- Cardinal 2m terrain routes between the anchors and from each to within 2m of the coast. Route endpoints and midpoints must remain at least 0.20m above water with slope at most 0.55m/m. Walking components are labelled once to bound rejection work.

The normal shore-distance query uses an exact segment hierarchy; it does not approximate the shoreline. Old preset generation retains its original calculations and hashes. Larger fragments, bad shapes and missing pockets are rejected instead of being fixed with artificial bridges or rectangular pads.

## Integration and limits

The 24MB import bound covers the larger full blueprint. Legacy field dimensions and validation limits remain explicit; old saves never receive new terrain. The island height ceiling is 120m, legacy remains 100m. Quality and conifer changes preserve stored geography.

Approved water, ground materials, KayKit/EZ-Tree assets and their existing budgets remain available. The offshore render continues the canonical query's flat seabed beyond the island grid, avoiding a visible rectangular underwater edge. The upstream water mask extent stays at the canonical field size while the visible sea extends farther, retaining shoreline precision at the existing 256/512 texture resolutions. Island cameras accommodate the larger extent. Reference fallback and old-world previews remain available. No custom shader, gameplay balance, population or clan rule is added.

Shape metrics screen obvious artifacts; visual acceptance still requires examining the bare terrain. The model approximates geological results at settlement scale, without tectonic time integration, glacier dynamics or sediment transport. Detailed biome zoning and ground transitions remain later slices.

## Evidence and reproduction

See [the gallery](qa/macro-island-v03b/review.html) and [report](qa/macro-island-v03b/report.md).

```text
node --test tests/macro-island.test.mjs tests/world-generation.test.mjs
node scripts/qa/measure-macro-island.mjs
node scripts/qa/check-macro-island.mjs
```

QA scripts default to `scratch/macro-island`; use `QA_OUTPUT` for a new evidence folder and `QA_ORIGIN` for the preview server. Before/after process memory is not peak/GPU memory. Development-laptop timings are observational, not a few-millisecond release gate.
