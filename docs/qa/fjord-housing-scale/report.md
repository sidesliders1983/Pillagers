# Canonical Fjord housing scale and grid headings

Date: 2026-10-11. Route: /fjord-play. Edge, 1280×900 with touch support, Low quality.

## Observed source regression and correction

The first browser assertion failed because the rendered Longhouse was only about 4m high,
versus 5m for Homestead. Its width was also slightly smaller. Canonical Longhouse clones now
scale uniformly to the actual loaded Homestead height. Source files and textures remain intact.

| Model | Width | Height | Depth |
| --- | ---: | ---: | ---: |
| Homestead | 9.472m | 5.001m | 6.372m |
| Original Longhouse | 9.425m | 4.000m | 5.787m |
| Corrected Longhouse | 11.784m | 5.001m | 7.235m |

The corrected Longhouse is approximately 24% wider. All rendered models fit their existing
13m parcels, including their quarter-turn headings. A real management-panel upgrade from
Homestead to Longhouse retained height and physical position. Canonical export matches the
exact Core upgrade command replay.

## Grid headings and safe paths

The first projection assertion failed because every house had the same heading. Ordinary
homes now choose deterministic quarter turns from seed and building ID. Reprojection, upgrades
and save/load retain their heading without using simulation RNG. Active Farmyards remain at
180°; deactivation restores the ordinary heading at the same location. Tents remain unchanged.

The existing path regression caught rotated entrances facing neighbouring parcels. Paths now
use the closest safe exterior approach when that entrance is obstructed. Existing tests still
require three homes to connect with two paths, without crossing tents, water or steep terrain.

Targeted projection, lifecycle, movement and encounter checks: 49 passed, 0 failed.
Browser checks cover real source model dimensions, parcel containment, actual upgrade control,
retained placement and Core replay equality. Physical iPad Safari verification remains separate.
Formatting was reviewed manually and git diff --check passed; no formatter is configured.

## Reproduction

```powershell
node --test tests/fjord-bridge.test.mjs tests/fjord-lifecycle.test.mjs tests/living-fjord.test.mjs tests/fjord-interactions.test.mjs
node scripts/qa/check-fjord-housing-scale.mjs
```

[Machine observations](result.json) · [Visual review](review.html).

Future layout direction: a central bonfire/plaza becomes the facing target for ordinary houses.
This pass implements temporary grid headings without adding a new gameplay building or balance rule.
