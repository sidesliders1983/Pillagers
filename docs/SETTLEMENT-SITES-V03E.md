# Player and hidden rival sites — v0.3e

Issue #134 adds an explicit settlement-placement stage to the accepted r2 island generator. It reserves a coastal player site and a separate terrain-hidden rival site. The rival is spatial metadata only: there are no CPU buildings, residents, resources or simulation changes.

## Review in Environment Lab

Open `/environment-lab`, expand **Settings**, choose **Nordic Island · gentler highlands**, enable **Player & hidden rival sites · v0.3e-r2 (islands)**, enter **18** and choose **Generate World**. The checkbox now explicitly selects generator version `fjordside-island-v0.3e-r2`, combining the unchanged site rules with the [approved follow-up scope for gentler highlands](MACRO-ISLAND-V03B.md#gentler-highlands--owner-follow-up-to-137). Leaving it off generates macro-only r3 terrain. The earlier `fjordside-island-v0.3e` version remains explicitly reproducible and old imports retain their exact field. Existing gameplay routes still use their existing presets; this slice does not switch new campaigns to islands.

Choose **Settlement sites & sightlines** with **Island overhead** or **Island oblique**. Green marks player construction bounds/foundations, pink marks the rival reservation/foundation feasibility, gold marks the neutral-space buffers, cyan marks the natural access route and measured berth, and orange marks sightlines stopped by terrain. Grey crosses mark other buildable candidate anchors. Every measured ray is saved; the overlay shows approximately eighteen representative rays to remain readable.

**Player starting view** uses the same camera position as the visibility proof. With source materials and the village enabled, the six authored reference buildings are displayed only at the player site. The reference residents remain Lab fixtures; no CPU population is created. Turning Nature off allows terrain-only review.

**Settlement placement diagnostics** shows every candidate's area, bounds, slope, elevation, coast distance, foundation fit and score. The pair picker exposes all ranked pair records and rejection reasons. “Not evaluated” is reported explicitly for criteria skipped after an earlier rejection or when a higher-ranked valid pair has already been selected. Export contains all candidate, pair, route and visibility data. Rejected worlds retain the requested seed and can be inspected and exported.

## Shared contracts and versioning

`GenerateWorld` remains the single generator. The new stage extends `PlanSettlement`, `SettlementLayout`, `PlanNature` and `ValidateNavigation`; it does not introduce a second house-layout engine or terrain renderer. Authored house and Farmyard dimensions are preserved. The search rotates each complete parcel, including its Farmyard ground.

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

The existing natural-pocket search supplies deterministic anchors. The placement stage uses 10m anchor spacing and a 65m connected-pocket radius; the old macro generator retains its original search. Dry lowland below 10m and slope at most 0.12 is split at narrow necks: broad cores have at least 6m cardinal-grid clearance from water/steep/high terrain and at least 200m2 area. A geodesic flood assigns connected lowland to these cores. Compartments describe geographic candidate coverage; they do not replace the final terrain-occlusion and separation proof.

The candidate budget is distributed round-robin across compartments with eligible anchors. Within each, area ranking is followed by spatially spread alternatives. Every core reports eligible anchors, evaluated candidates, six-parcel fits and explicit rejection/budget reasons. Compass sectors and evenly spaced angular divisions do not define these areas. The Lab's geographical coverage disclosure exposes this evidence.

Each candidate must still fit all six reference parcels, including the largest Farmyard. At 4m position spacing, the physical search considers the authored rotation plus eight compass rotations. It tries up to twelve combinations of four layout directions and three orders (largest first, most constrained first, smallest first), with up to 1,000 placement nodes per combination and twelve distinct locations per branch. Backtracking can undo an earlier placement. At each location the first valid ranked orientation is used; this remains a bounded conservative search, not an exhaustive packing proof. Original 7m parcel margins and 14m center clearance remain in place, including space for grading transitions. No parcel is resized.

Physical pose checks and player reachability are cached. Rejection stops at the first exposed roof sample: the pair explicitly reports a lower bound on exposed rays and the number sampled. Accepted pairs always retain the complete footprint/roof-height proof.

Grading affects only individual player foundations and their narrow transition margins. It never creates a settlement-wide rectangular platform, raises submerged ground or changes the coastline. A support margin ensures every triangle below a flat authored parcel is level. The maximum change at any adjusted terrain vertex is 0.6m. Rival foundations record feasibility but leave the rival terrain unmodified until future construction.

Candidate ranking uses connected area, mean slope and coastal proximity. Dryness, foundation stability, natural elevation, usable shoreline, clearance, neutral space, route feasibility and hiddenness are hard qualifications. Pair scores combine site scores; exposed pairs receive an explicit penalty and fail. Tie-breaking uses stable candidate IDs. The highest-ranked valid pair is selected; lower-ranked alternatives are retained as not evaluated. Richer resource/forage and wetland scoring remains #135/#136, when that spatial evidence exists. No resource stocks are invented from scenery.

## Visibility and access evidence

Three starting observers are checked: 1.7m eye height at the dry landing, 1.7m eye height at the settlement center, and the documented shore-facing player-start camera. The camera is 60m seaward and 20m lateral to the landing-center direction, at least 18m high and at least 12m above local terrain. The Lab's **Player starting view** consumes the same pose.

Every point of a rectangular rival-footprint grid at no more than 4m spacing, including its edges/corners, is tested 8m above the actual terrain. The entire sampled footprint must be occluded. This is a documented sampling model, not a claim about every continuous point between target samples or all possible future towers/cameras.

Each individual ray follows the canonical alternating triangle topology exactly: grid-edge and diagonal intersections divide it into linear terrain/ray intervals. Narrow intervening triangles cannot be skipped by a fixed marching step. A visible edge disqualifies a footprint even when its center is hidden. Trees, atmospheric fog and distance never prove hiddenness. Unrestricted overhead/debug cameras can reveal the reservation; no fog of war is implemented.

A dry reachable coastal point alone does not prove harbor usability. The planner reserves a padded 16.5 × 5m water rectangle for the authored 14.47 × 3.48m longship, requiring at least 0.5m depth across all touching terrain triangles and a short continuous seaward approach. This is clearance metadata, not a spawned ship or a new docking mechanic.

Cardinal access is measured on the existing 1m navigation grid. Both sites' footprints are excluded. The 240m minimum applies to the actual landing-to-rival route, not straight-line distance. Scenery is kept clear of foundations and this critical corridor; the final scenery-aware navigation is validated again. The corridor is a natural traversability proof, not a constructed road across neutral land.

## Evidence and current limitation

The original [1/10 report](qa/settlement-sites/report.md) remains an unchanged historical record. The [refinement review](qa/settlement-sites-refinement/review.html) and [measurement](qa/settlement-sites-refinement/batch.json) report the current ten fixed seeds, including compartment coverage, placement attempts, measured time, repeated blueprint hashes and complete save/load.

The refined search accepts **5/10 seeds**: 42, 1983, 18, 211 and 819. Seeds 17, 91, 1337 and 512 still lack two suitably separated six-parcel areas; seed 104 additionally fails route/visibility checks. This is an improvement but does not promise universal campaign generation. The opt-in Lab stage and draft PR remain under owner review. No reseeding or weaker acceptance is used.

See [founding versus expansion capacity](SETTLEMENT-CAPACITY-REVIEW.md). The six authored Lab parcels are a mixed expansion stress case, not the actual founding party's shelter count. Their acceptance requirement is unchanged. Physical iPad testing has not been performed; browser evidence uses a touch-enabled tablet viewport.

## Reproduction

```text
node --test tests/settlement-sites.test.mjs
node scripts/qa/measure-settlement-sites.mjs
node scripts/qa/check-settlement-sites.mjs
pnpm run build
```

QA output defaults to `scratch/settlement-sites-refinement`; `QA_OUTPUT` selects a different directory and `QA_ORIGIN` selects the Lab server (default `http://127.0.0.1:5191`). Timings are observations on the development laptop, not a millisecond release gate. No project formatter is configured; source formatting and `git diff --check` are reviewed directly.

### Founding capacity and phase-cost evidence

[Real campaign capacity and generation costs](qa/settlement-capacity/report.md) compare the actual Fjord allocator on both regions, including fixed and held-out seeds. Six authored Lab parcels remain the unchanged stress contract; campaign defaults remain unchanged. The optional `generateWorld(request, observer)` callback reports phase durations outside the saved blueprint and RNG. Timing measurements do not affect generation or define a new performance gate.
