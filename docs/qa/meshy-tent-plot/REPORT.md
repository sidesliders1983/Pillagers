# Tent building-plot review - 10 October 2026

The owner requested space for eventual replacement of the tent by a house, with no rendered grass beneath it. The compact approved GLB remains unchanged: approximately 1.50m tall, 1.88m wide and at most 2m deep. This pass reserves a separate **6m by 6m plot for the first Hut**, based on measured Hut overhangs plus at least 0.75m working space per side. Bigger future house sizes will need their own larger plot contract.

Placement measures actual house/farmyard and prop boxes, including overhangs, with 0.65m separation outside the plot. Routes and non-grass nature remain clear. Generated plots sample nine dry, flat support points; Reference uses the existing rendered houses/props and shared route field to select a dry, clear gap. The tent's collision box remains compact, so residents can walk through the surrounding working space.

The Reference and generated scenes share one rendered-instance filter. It excludes complete authored instances whose actual horizontal bounds overlap the plot, including grass rooted outside it. This changes rendering once at startup without modifying the stored blueprint, re-running generation, consuming RNG or altering shared geometry/materials. The original ground texture treatment remains visible.

## Visual and runtime checks

Reviewed [Reference plot](reference-tent-plot-day.webp), [generated plot](generated-17-tent-plot-day.webp), [generated exterior](generated-91-tent-day.webp), their close-up/interior and night views. The enlarged gap stays near the village, without moving its original houses or twenty scenery attachments. The open entrance and hollow interior remain intact.

| Scene | Tent location (x, z) | Removed nature instances | Remaining plot overlaps | Minimum sampled resident clearance | Resident displacement |
| --- | --- | --- | --- | --- | --- |
| reference | 10, 17 | 0 | 0 | 4.08m | 4.41-6.63m |
| generated-17 | 46, 16 | 0 | 0 | 5.00m | 0.99-6.40m |
| generated-91 | 46, 16 | 1 | 0 | 2.13m | 2.53-6.39m |

Generated seed 91 removes one `kaykit-grass-cluster-b` instance from the reserved plot. A separate valid import places a real `kaykit-grass-cluster-a` at the centre of the seed-17 tent. The filter removes that exact asset from rendering and leaves zero plot overlaps, while export retains the complete imported blueprint, including the planted grass. Attachment positions also compare unchanged. See [the controlled grass fixture](generated-17-grass-fixture-tent-plot-day.webp).

Each scene records twenty snapshots of ten moving residents. Every sample remained safe, followed the rendered ground height, and stayed at least 0.65m outside the tent's physical box. The displacement values show continued movement during the sample period. These are sampled scene checks, not exhaustive route or world-seed guarantees. Raw observations and the planted fixture are in [results.json](results.json); there were no browser console/page errors in the final run.

## Saves and validation

- The visible Fjord test first failed because no building plot was reserved. It now passes the minimum plot dimensions and zero rendered overlaps through the existing world diagnostics, cameras and import/export controls.
- v2 and v3 previews validate against their previous source plans and migrate only the tent to the reserved plot. Geography and the other twenty attachments compare unchanged. v4 reload/export is exact; original v1 worlds still export unchanged and add no tent.
- `node --test tests/meshy-tent.test.mjs`: both decoded-GLB tests pass (dimensions, open doorway, hollow volume and inside surfaces). The GLB is identical to the compact-scale revision.
- Existing Fjord browser regression passed fresh startup/reload, generation, pause, local save/load and invalid imports.
- TypeScript and production build passed. Vite reports its existing large-chunk warning. Only this branch's reproducible build output was removed afterwards to leave local disk space for browser review.
- Formatting was reviewed manually and `git diff --check` passed; the repository has no configured formatter.
- An intermediate automation run timed out reopening the diagnostics panel while edits were still being applied. The final run used completed source and explicitly waited for panel visibility, and passed all three scenes and the controlled grass fixture.
- The original full-suite/character audits remain in [the initial report](../meshy-tent/REPORT.md); current-head GitHub checks run the full contracts again. The [earlier compact-scale measurements](../meshy-tent-compact/REPORT.md) remain untouched.
