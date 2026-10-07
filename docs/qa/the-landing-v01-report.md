# The Landing v0.1 QA report

Executed 2026-10-07 for issue #32 and the corrected household Farmyard model in #28. This run supersedes the standalone Farmyard prototype report.

- Full suite: **70 passed, 0 failed, 0 skipped**, including eleven landing scenarios.
- TypeScript and production build passed. Existing Three.js chunk-size warning remains.
- Fifty-Winter run: seed 32; starts at Winter 800 with ten founders, 30 Food, 5 Materials, one longship, two cows/one bull and no permanent buildings.
- Commands: keep ship, advance 321 ticks, salvage ship, build a home, assign its resident as farmer, assign each animal individually, slaughter bull after eleven Winter advances.
- Ends at Winter 850 tick 321 with twenty-six personas, two living cows, six surviving houses, 193 Food and 367 Materials.
- Semantic history includes three existing founding couples, six later partnerships, sixteen births, one ship salvage and one slaughter.
- Repeated execution, 137/863 split ticks and midpoint save/reload yield an identical final state.
- Integer/nonnegative stocks passed for every checkpoint.
- Final-state SHA-256: `66a538892f5bb99762b35aa21fc70876cc9508c211ad4e5f489c17ff9ed9d379`.

## Scenario evidence

| Behavior | Evidence |
|---|---|
| Deterministic viable founders | Ten named CharacterDNA founders, ages 18–40, minimum four of each sex, different seeds vary party |
| Landing infrastructure | Shared tents for couples and individual tents for singles; zero permanent buildings; unsettled Region marker |
| Longship choice | Keep preserves capability/no gain; configured salvage pays once; repeat salvage/keep-after-salvage rejected |
| Exposed cattle | Two cows produce total 4 Food; three cattle consume 3; ten adult founders consume 20; idle first-Winter stock 30 → 11 |
| Shelter | Farmyard restores total cow output to 8; no animal creation; normal base upkeep/debt rules |
| Soft cap | Capacity configured to two accepts all three cattle and reports one overcrowded animal; no deaths introduced |
| Slaughter | Configured 17 Food pays once; dead animal retains identity but no longer consumes/produces |
| Save validity | Rejects invalid/fractional configuration, absent mechanics, invalid founder/cattle/ship references and future asset dates |
| Farmyard collapse | Three unpaid upkeep Winters collapse it; 5 Materials salvage; surviving cattle return to exposed half output |
| Replay | Fifty Winters, partial tick position, split commands, save/resume and forbidden Date.now/Math.random remain equivalent |

Reproduce with `node scripts/qa/run-landing.mjs`. It generates `artifacts/qa/the-landing/report.json` and `final-state.json`. Scenario tests run with `node --test tests/landing.test.mjs`.

This report establishes behavior for the tested seeds and command sequences. It is not a final balancing study. Livestock reproduction, natural mortality and the future overcapacity mortality penalty are deliberately deferred. The agreed soft cap is represented by saved capacity/animal assignments and derived overcrowding. Gameplay Lab browser checks cover individual assignment and removal of the last farmer. Old saves retire standalone Farmyards without compensation while retaining history.

Founding-couple evidence: 100 seeds cover counts 0, 1, 2 and 3, with a majority of parties having 1–2 couples. Each couple passes normal eligibility, has reciprocal partners and a shared tent, and roundtrips deterministically. Chance 0 disables pairing; chance 10000 with cap 2 gives two. Invalid probability/cap values are rejected. Existing saves do not reroll relationships.
