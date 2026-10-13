# Environment zoning v1 — #135 review

Measured 2026-10-13T13:32:29.477Z. [Interactive comparison gallery](review.html). [Versioned contract](../../ENVIRONMENT-ZONING-V03C.md).

## Outcome

All ten fixed seeds replay identically and round-trip through save/load. Terrain, geology, coast, foundation layouts, player/rival selection and LOS evidence exactly match the same request without zoning. Placement clearance checks pass for all props against both sets of foundations and critical routes. Six seeds pass the inherited site criteria; four retain exactly the same rejection reasons. No thresholds were weakened. This is opt-in Environment Lab metadata, not production campaign adoption. The earlier real-campaign allocator limitation remains open.

The new substrate masks form broad grassland, bedrock and sheltered wetland regions. Forest cover is a separate continuous field visible even without trees. Narrow shore components follow the physical coast. All normal-climate snow values are zero. Rock does not imply blocked navigation.

## Fixed comparison set

Seeds were fixed before examining the zoning output; rejected seeds were not replaced. Percentages below are relative to land samples, and forest overlaps substrate.

| Seed | Existing site result | Grass | Sand | Mud | Bedrock | Forest ≥0.4 | Zoning stage | Full save |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 17 | REJECTED | 49.9% | 5.0% | 12.3% | 32.7% | 20.8% | 397 ms | 17.10 MB |
| 42 | PASS | 54.9% | 4.8% | 9.0% | 31.2% | 13.3% | 425 ms | 17.68 MB |
| 91 | REJECTED | 53.8% | 4.9% | 9.2% | 32.1% | 20.0% | 361 ms | 17.10 MB |
| 1983 | PASS | 62.4% | 5.4% | 9.6% | 22.7% | 22.9% | 353 ms | 17.50 MB |
| 1337 | REJECTED | 65.7% | 4.9% | 8.7% | 20.7% | 22.8% | 379 ms | 17.08 MB |
| 18 | PASS | 54.1% | 4.3% | 12.9% | 28.7% | 20.7% | 354 ms | 17.54 MB |
| 7 | PASS | 63.6% | 5.2% | 8.4% | 22.8% | 19.8% | 409 ms | 17.46 MB |
| 73 | REJECTED | 46.3% | 4.4% | 11.5% | 37.8% | 15.7% | 358 ms | 17.07 MB |
| 256 | PASS | 66.9% | 4.5% | 7.6% | 21.0% | 25.7% | 343 ms | 17.58 MB |
| 65537 | PASS | 51.3% | 4.9% | 10.2% | 33.6% | 15.2% | 348 ms | 17.56 MB |

## Named transitions — seed 18

| Example | X,Z (m) | Elevation above sea (m) | Slope m/m | Ground | Rock | Moisture | Forest | Snow |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lowCliff | (-84, 124) | 9.56 | 1.60 | bedrock | 0.94 | 0.192 | 0 | 0 |
| gentleHighland | (-72, -80) | 75.64 | 0.07 | grass | 0.34 | 0.279 | 0 | 0 |
| shelteredLowland | (96, -228) | 5.26 | 0.02 | mud | 0 | 0.737 | 0.319 | 0 |
| wetland | (92, -224) | 5.41 | 0.05 | mud | 0 | 0.788 | 0.3 | 0 |
| forest | (116, -184) | 7.20 | 0.28 | grass | 0.021 | 0.858 | 0.916 | 0 |

The low cliff is much rockier than the gentle highland. Sheltered lowlands develop wet soil; the forest example has moist grass substrate instead of replacing soil with a forest texture. These are terrain-derived descriptive fields, not a physical climate/erosion simulation.

## Visual scope and limits

The gallery contains ten headless canonical maps each for primary ground, forest, moisture and rock; ten actual Lab oblique region renders; ten source-material shore views at normal distance; and all eight diagnostic views for seed 18. Shader/material blending is not part of this slice. Mud remains represented by the existing grass/soil material until #137. Forest density in rendered scenes still follows the existing asset budget, so the broad cover field is more extensive than the sparse visible trees. The old repeating texture pattern at normal distance is also outside this zoning slice.

Region boundaries deliberately expose the 4 m classification grid; continuous influence overlays interpolate smoothly. Tiny shore/water fragments remain to avoid modifying the physical coast. Seed 42 retains two nonshore components smaller than nine samples after the bounded cleanup; the other nine seeds have none. These are recorded rather than hiding or rerolling the seed.

## Cost and evidence boundaries

Intel(R) Core(TM) i7-7700HQ CPU @ 2.80GHz; 8 logical cores; 15.86 GiB RAM; Node v24.19.0.

Paired headless totals: 89.10 s baseline → 95.94 s zoned across ten seeds (7.67% in this single ordered pass). The isolated zoning stage took 343–425 ms. Each candidate was then independently regenerated for the determinism check; that second generation is not included in these totals. No CPU tests were run concurrently with the timed batch. These are local observations, not a statistical speed claim. Generation still blocks the Lab synchronously for several seconds.

Saved zoning JSON adds 1.68–1.76 MB. Full saves remain below the existing 24 MB import limit. Ten numeric arrays plus 32-bit region IDs would occupy about 3.39 MB as a packed numerical payload; actual JavaScript arrays, strings and object overhead are additional. The batch records process memory observations, not peak or isolated retained heap. Renderer geometry/texture counts are observed allocations, not GPU byte measurements.

Paired renderer sample: headless Edge, Low quality, 1440×1000 viewport, seed 18, identical player camera and approved assets, fog off, paused waves/wind. Six reported windows per variant after settling:

baseline: mean of six reported windows 66.94 ms/frame, 71 calls, 5223930 triangles (includes shadows), 38 geometries, 87 textures

zoned: mean of six reported windows 73.45 ms/frame, 71 calls, 5207584 triangles (includes shadows), 38 geometries, 87 textures

The separate functional browser run used a 1024×768 tablet viewport for source-material controls and kept four renderer-window summaries. Neither dataset stores individual frame times or all outliers. Tablet emulation is not physical iPad validation.

## Validation and reproduction

Public blueprint/query/save-load tests cover terrain preservation, cliff/highland contrast, a cold test fixture, zero normal-climate snow, nature consumption, conifer replacement and malformed region bounds/metadata. The batch additionally checks full deterministic output and every foundation/critical-route exclusion. Browser controls exercise eight overlays, explicit generation, export/import, legacy/reference fallback and tablet-sized UI. Browser errors: 0.

An independent source-at-revision comparison against merged main ff7d01cf847009e37d9be6b731fd8fffe08f77fb also matched old generation and load exactly for fjord seed 17, first island generator seed 42 and v0.3e seed 18.

Run the measure, check, capture and publish scripts in scripts/qa. Measurement saves stay in ignored scratch; the committed batch contains hashes, counts, timings, examples and reasons. Browser comparisons import those exact saved candidates. Build/unit/asset checks are also required on the PR head. Owner visual approval remains separate from automated validation.
