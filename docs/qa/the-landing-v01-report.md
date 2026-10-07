# The Landing v0.1 QA report

Executed 2026-10-07 for issue #32.

- Full suite: **62 passed, 0 failed, 0 skipped**, including eight landing scenarios.
- TypeScript and production build passed. Existing Three.js chunk-size warning remains.
- Fifty-Winter run: seed 32; starts at Winter 800 with ten founders, 30 Food, 5 Materials, one longship, two cows/one bull and no permanent buildings.
- Commands: keep ship, advance 321 ticks, salvage ship, establish Farmyard, slaughter bull after eleven Winter advances.
- Ends at Winter 850 tick 321 with twelve personas, two living cows, six buildings, 8 Food and 718 Materials.
- Semantic history includes five partnerships, two births, one ship salvage and one slaughter.
- Repeated execution, 137/863 split ticks and midpoint save/reload yield an identical final state.
- Integer/nonnegative stocks passed for every checkpoint.
- Final-state SHA-256: `5248632ca13ec768410e1f4120e0d3e1efa7847cfcbafe0c1c96743f67136978`.

## Scenario evidence

| Behavior | Evidence |
|---|---|
| Deterministic viable founders | Ten named CharacterDNA founders, ages 18–40, minimum four of each sex, different seeds vary party |
| Landing infrastructure | Ten tent households; zero permanent buildings; unsettled Region marker |
| Longship choice | Keep preserves capability/no gain; configured salvage pays once; repeat salvage/keep-after-salvage rejected |
| Exposed cattle | Two cows produce total 4 Food; three cattle consume 3; ten adult founders consume 20; idle first-Winter stock 30 → 11 |
| Shelter | Farmyard restores total cow output to 8; no animal creation; normal base upkeep/debt rules |
| Soft cap | Capacity configured to two accepts all three cattle and reports one overcrowded animal; no deaths introduced |
| Slaughter | Configured 17 Food pays once; dead animal retains identity but no longer consumes/produces |
| Save validity | Rejects invalid/fractional configuration, absent mechanics, invalid founder/cattle/ship references and future asset dates |
| Farmyard collapse | Three unpaid upkeep Winters collapse it; 5 Materials salvage; surviving cattle return to exposed half output |
| Replay | Fifty Winters, partial tick position, split commands, save/resume and forbidden Date.now/Math.random remain equivalent |

Reproduce with `node scripts/qa/run-landing.mjs`. It generates `artifacts/qa/the-landing/report.json` and `final-state.json`. Scenario tests run with `node --test tests/landing.test.mjs`.

This report establishes behavior for the tested seeds and command sequences. It is not a final balancing study. Livestock reproduction, natural mortality and the future overcapacity mortality penalty are deliberately deferred. The agreed soft cap is represented by saved capacity/animal assignments and derived overcrowding. Clickable presentation belongs to the Gameplay Lab/prototype issues.
