# Player and hidden rival sites — v0.3e

Issue #134 adds an explicit settlement-placement stage to the accepted r2 island generator. It reserves a coastal player site and a separate terrain-hidden rival site. The rival is spatial metadata only: there are no CPU buildings, residents, resources or simulation changes.

## Review in Environment Lab

Open `/environment-lab`, expand **Settings**, choose **Nordic Island · v0.3b**, enable **Player & hidden rival sites · v0.3e (islands)**, enter **18** and choose **Generate World**. The checkbox explicitly selects generator version `fjordside-island-v0.3e`. Leaving it off preserves the accepted macro-only r2 generation. Existing gameplay routes still use their existing presets; this slice does not switch new campaigns to islands.

Choose **Settlement sites & sightlines** with **Island overhead** or **Island oblique**. Green marks player construction bounds/foundations, pink marks the rival reservation/foundation feasibility, gold marks the neutral-space buffers, cyan marks the natural access route and measured berth, and orange marks sightlines stopped by terrain. Grey crosses mark other buildable candidate anchors. Every measured ray is saved; the overlay shows approximately eighteen representative rays to remain readable.

**Player starting view** uses the same camera position as the visibility proof. With source materials and the village enabled, the six authored reference buildings are displayed only at the player site. The reference residents remain Lab fixtures; no CPU population is created. Turning Nature off allows terrain-only review.

**Settlement placement diagnostics** shows every candidate's area, bounds, slope, elevation, coast distance, foundation fit and score. The pair picker exposes all ranked pair records and rejection reasons. “Not evaluated” is reported explicitly for criteria skipped after an earlier rejection or when a higher-ranked valid pair has already been selected. Export contains all candidate, pair, route and visibility data. Rejected worlds retain the requested seed and can be inspected and exported.

## Shared contracts and versioning

`GenerateWorld` remains the single generator. The new stage extends `PlanSettlement`, `SettlementLayout`, `PlanNature` and `ValidateNavigation`; it does not introduce a second house-layout engine or terrain renderer. Authored house and Farmyard dimensions and their rotations are preserved.

The singular `settlement` field remains the player site. Optional version-1 `rivalSite` and `siteSelection` records add reservation geometry, bounded configuration, measured evidence and diagnostics. The full terrain and metadata are serialized. Loading validates them without rerunning generation or replacing the saved field. The original `fjordside-v0.1`, `fjordside-island-v0.3b` and `fjordside-island-v0.3b-r2` versions remain explicit and retain their generation behavior. Asset/quality changes retain the selected sites and graded terrain.

## Placement limits

| Rule | Default |
| --- | ---: |
| Candidate anchors evaluated | At most 48, configurable through 64 |
| Natural connected lowland per candidate | At least 3,000m² |
| Natural foundation slope | At most 0.12 m/m |
| Foundation elevation | At least 0.25m above water |
| Maximum local foundation cut/fill | 0.6m |
| Minimum center distance | 160m |
| Minimum distance between construction bounds | 40m |
| Minimum walking route from landing to rival | 240m |
| Rival height tested above ground | 8m |
| Walking slope/elevation | At most 0.55 m/m; at least 0.20m above water |

The distance, buffer, walking-distance, roof-height, candidate-count and grading limits are saved in `config.siteRules`. They are prototype geometry limits, not travel time, gameplay balance or visibility/fog-of-war rules. The three separation limits and the foundation-grading limit were explicitly approved by the owner.

The existing natural-pocket search supplies deterministic anchors. Each candidate must fit all six reference parcels, including the largest Farmyard, using the actual dimensions. Parcels are fitted largest first to suitable nearby grid positions, with clearance for the middle place, neighboring parcels and grading transitions. The bounded greedy fit can reject a region where a more exhaustive arrangement might exist; rejection is not proof that every conceivable layout is impossible.

Grading affects only individual player foundations and their narrow transition margins. It never creates a settlement-wide rectangular platform, raises submerged ground or changes the coastline. A support margin ensures every triangle below a flat authored parcel is level. The maximum change at any adjusted terrain vertex is 0.6m. Rival foundations record feasibility but leave the rival terrain unmodified until future construction.

Candidate ranking uses connected area, mean slope and coastal proximity. Dryness, foundation stability, natural elevation, usable shoreline, clearance, neutral space, route feasibility and hiddenness are hard qualifications. Pair scores combine site scores; exposed pairs receive an explicit penalty and fail. Tie-breaking uses stable candidate IDs. The highest-ranked valid pair is selected; lower-ranked alternatives are retained as not evaluated. Richer resource/forage and wetland scoring remains #135/#136, when that spatial evidence exists. No resource stocks are invented from scenery.

## Visibility and access evidence

Three starting observers are checked: 1.7m eye height at the dry landing, 1.7m eye height at the settlement center, and the documented shore-facing player-start camera. The camera is 60m seaward and 20m lateral to the landing-center direction, at least 18m high and at least 12m above local terrain. The Lab's **Player starting view** consumes the same pose.

Every point of a rectangular rival-footprint grid at no more than 4m spacing, including its edges/corners, is tested 8m above the actual terrain. The entire sampled footprint must be occluded. This is a documented sampling model, not a claim about every continuous point between target samples or all possible future towers/cameras.

Each individual ray follows the canonical alternating triangle topology exactly: grid-edge and diagonal intersections divide it into linear terrain/ray intervals. Narrow intervening triangles cannot be skipped by a fixed marching step. A visible edge disqualifies a footprint even when its center is hidden. Trees, atmospheric fog and distance never prove hiddenness. Unrestricted overhead/debug cameras can reveal the reservation; no fog of war is implemented.

A dry reachable coastal point alone does not prove harbor usability. The planner reserves a padded 16.5 × 5m water rectangle for the authored 14.47 × 3.48m longship, requiring at least 0.5m depth across all touching terrain triangles and a short continuous seaward approach. This is clearance metadata, not a spawned ship or a new docking mechanic.

Cardinal access is measured on the existing 1m navigation grid. Both sites' footprints are excluded. The 240m minimum applies to the actual landing-to-rival route, not straight-line distance. Scenery is kept clear of foundations and this critical corridor; the final scenery-aware navigation is validated again. The corridor is a natural traversability proof, not a constructed road across neutral land.

## Evidence and current limitation

See [review images](qa/settlement-sites/review.html), [the report](qa/settlement-sites/report.md) and [the ten-seed measurement](qa/settlement-sites/batch.json).

**Only seed 18 passes the initial ten-seed batch.** Seeds 17, 42, 91, 1983, 1337, 104, 211, 512 and 819 reject on foundation-fit and/or separation constraints. All ten repeat deterministically and round-trip their full saves. This strict site stage must not be mistaken for the earlier macro feasibility pass. The initial fixed reference arrangement also failed its slope check at every coarse anchor in seven of ten seeds; area alone was never sufficient proof of buildability.

The low acceptance rate is a known limitation of the current natural shelves plus conservative six-parcel fit. This feature remains an explicit Lab option. Improving search yield must preserve the approved grading/geometry limits and geological terrain; it must not silently reseed or weaken acceptance. Physical iPad testing has not been performed for this slice; browser evidence uses a touch-enabled tablet viewport.

## Reproduction

```text
node --test tests/settlement-sites.test.mjs
node scripts/qa/measure-settlement-sites.mjs
node scripts/qa/check-settlement-sites.mjs
pnpm run build
```

QA output defaults to `scratch/settlement-sites`; `QA_OUTPUT` selects a different directory and `QA_ORIGIN` selects the Lab server (default `http://127.0.0.1:5191`). Timings are observations on the development laptop, not a millisecond release gate. No project formatter is configured; source formatting and `git diff --check` are reviewed directly.
