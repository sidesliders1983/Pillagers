# Gentler island highlands — controlled comparison

The owner accepted the #137 material direction and then requested lower central ridges. This is a separate, explicitly versioned geography follow-up within PR #145. The earlier ground-blending gallery remains unchanged.

The existing eroded ridge field is lowered above 6.2m over sea level. Across the next 12 vertical metres, the height derivative transitions smoothly from 1 to a spatially varying retained fraction of 0.40–0.58. Above that shoulder, the same fraction applies. The broad variation reuses the existing bedrock noise stream; it does not place cones, alter drainage routes, add mesh noise or store another terrain field. The coastline, sea and lowlands at/below 6.2m are unchanged before bounded foundation grading.

New Environment Lab islands explicitly use fjordside-island-v0.3b-r3, or fjordside-island-v0.3e-r2 with Player & hidden rival sites. Existing API defaults and campaign presets remain unchanged. Old versions and imports preserve their original canonical field. All five pre-change saved fixtures regenerate byte-for-byte; all five new worlds reproduce deterministically and pass full save/load.

The #134 rules are unchanged: 160m between centres, 40m between construction zones, 240m minimum landing route, at most 0.6m foundation grading, and terrain occlusion of the sampled rival footprint up to 8m building height from all three starting viewpoints. The final scenery-aware connection is checked as walkable. The planner reruns after lowering; some pairs and routes change. Visibility remains a documented sampled-footprint proof, not a guarantee for every future camera or tower.

All five fixed seeds pass. Peaks fall from 58.8–75.8m to 37.3–46.1m. The reported slope statistic is the 90th percentile of physical-query slopes at the same cells that were above 16m in the old world; it is not an average over an expanding lowland region. No acceptance criterion, seed or material recipe was changed to achieve this result. These are five regression examples, not a claim that every seed qualifies.

Each before/after pair uses identical cameras, sun direction, light colour/intensity and exposure. Material views use Day; bare-form views use Low sun to make relief readable. Fog, water, vegetation and village are disabled in the paired captures. Shadow bounds automatically fit each changed terrain and are recorded in browser.json. Material maps and projection settings are unchanged; #135 zoning is recomputed from the new canonical slopes/elevation through its existing classifier. The final settlement image is contextual, not a matched camera pair, because the selected player site can change.

Elevation maps use a fixed 0–80m scale in metres above sea level and show the entire 800×800m heightfield without vegetation or material detail. Bare-form and source-material renders are separate. No new performance benchmark is claimed for this geometry pass. Visual acceptance remains with the owner.

| Seed | Peak metres, before → after | Highland slope p90, m/m | Sites | Exposed roof rays | Route metres |
| --- | --- | --- | --- | --- | --- |
| 18 | 75.8 → 46.1 | 2.9 → 1.4 | PASS | 0 | 792 |
| 42 | 65.8 → 38.2 | 2.8 → 1.3 | PASS | 0 | 898 |
| 1983 | 58.8 → 37.3 | 2.5 → 1.2 | PASS | 0 | 868 |
| 7 | 67.9 → 42.8 | 2.6 → 1.4 | PASS | 0 | 363 |
| 256 | 62.6 → 39.0 | 1.9 → 1.0 | PASS | 0 | 553 |

## Reproduce

```text
node --test tests/island-highlands.test.mjs
node scripts/qa/measure-island-highlands.mjs
node scripts/qa/check-island-highlands.mjs
node scripts/qa/publish-island-highlands.mjs
```
