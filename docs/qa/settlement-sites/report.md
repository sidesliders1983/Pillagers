# Settlement sites v0.3e — initial review

PR #138 is merged. This report covers the #134 implementation on its separate branch.

The placement stage is an explicit Environment Lab option. It reserves one player site and a hidden rival site, preserves authored parcel sizes, caps local grading at 0.6m and leaves Simulation Core/gameplay campaign generation unchanged. Rival data is metadata only.

## Ten fixed seeds

| Seed | Result | Candidates fitting six parcels | Center distance (m) | Walking route (m) | Sightlines |
| --- | --- | --- | --- | --- | --- |
| 17 | REJECTED | 0/30 | — | — | not evaluated |
| 42 | REJECTED | 4/30 | — | — | not evaluated |
| 91 | REJECTED | 0/20 | — | — | not evaluated |
| 1983 | REJECTED | 3/48 | — | — | not evaluated |
| 1337 | REJECTED | 15/48 | — | — | not evaluated |
| 18 | PASS | 17/41 | 310.5 | 762 | 1425 |
| 104 | REJECTED | 6/32 | — | — | not evaluated |
| 211 | REJECTED | 0/38 | — | — | not evaluated |
| 512 | REJECTED | 4/39 | — | — | not evaluated |
| 819 | REJECTED | 6/31 | — | — | not evaluated |

Every run reproduced its blueprint hash and round-tripped the full save. Rejected worlds retained their original seed and named reasons. `batch.json` preserves candidate dimensions, per-seed timing, scores and rejection counts. These are per-run measurements, not raw frame timings, peak memory or GPU measurements.

**Acceptance rate: 1/10.** This is the principal limitation. The coarse macro pockets from #133 do not guarantee room for six authored parcels within the newly approved grading limits. The conservative fit does not claim exhaustive packing. The failed seeds are not silently rerolled and the limits were not weakened to turn them green.

Seed 18 reserves sites over 310m apart, with about 200m between construction bounds and a 762m natural route from the landing. Every sampled rival footprint point at 8m height is hidden from the three documented starting viewpoints. The player-start screenshot uses that same camera. Higher debug cameras can see the reservation.

## Browser and visual inspection

- Seed generation, candidate/pair diagnostics, reservation/LOS overlay and shared start camera passed.
- Export/import passed. The camera position matches the visibility proof within floating-point roundoff.
- Touch-enabled 1024×768 viewport and orbit interaction passed, without browser page errors. This does not certify a physical iPad.
- Top-down: distinct player and rival zones on opposite sides of substantial interior terrain, with a longer coastal walking connection.
- Starting view: the authored player reference houses are visible; intervening terrain fills the backdrop. The rival location is hidden under the documented sample model.
- Existing terrain/water/material style is retained. Biome/ground refinement remains outside #134.

The full suite passed: 705 passed, 0 failed, 1 existing opt-in skip (706 total). The production build and required character validation passed. See `validation.json`; GitHub CI is tracked separately at the PR head. Keep the PR draft while checks are pending or failing. The low acceptance rate remains explicit for owner review even after technical checks pass.
