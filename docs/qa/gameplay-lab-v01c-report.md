# Gameplay Lab v0.1C QA report

Executed 2026-10-07 for issue #28.

- Full regression suite: **69 passed, 0 failed, 0 skipped**.
- Three new public-boundary tests cover active pacing/pause/speed, command forwarding/stock changes/save-load/new seed, and canonical work inspection.
- TypeScript and production build passed; the existing Three.js chunk-size warning remains for Fjordside.
- Gameplay Lab production bundle is independently loaded; no Three.js/GLB request occurred in the browser flow.
- Desktop opening and 390px viewport screenshots were visually inspected; the narrow viewport has no horizontal overflow.

## Browser playable proof

| Check | Result |
|---|---|
| Landing Winter 800 and ten person cards | PASS |
| Ship salvage, house building, specialization and upgrade | PASS |
| Automatic permanent-home Farmyard, individual cattle assignment and last-farmer deactivation | PASS |
| Occupation assignment and linked lineage inspection | PASS |
| Advance Winter, local save and paused reload | PASS |
| Live 1-minute/Winter speed and pause without subsequent tick advance | PASS |
| Live clock retains controls, focus, unfinished values and open details | PASS |
| JSON file chooser import, eligible caregiver assignment and invalid JSON rejection | PASS |
| No browser runtime errors or Three.js/GLB requests | PASS |
| Narrow viewport without horizontal overflow | PASS |

A QA care fixture uses the public campaign/core commands to form families and an eligible unemployed donor, then imports its validated JSON through the actual import button/file chooser. This exercises a care situation without changing normal campaign defaults.

Review found an import defect: repainting immediately after opening the chooser detached its input. The browser test first demonstrated that selection was not loaded. The fix pauses and paints before opening, then retains the input until completion; the real chooser test now passes.

The corrected Farmyard scenario is covered by the Landing fifty-Winter replay runner. The earlier standalone-Farmyard checksum is historical and is superseded by this gameplay correction. Hidden-tab pause is implemented through `visibilitychange`; controller tests prove pause excludes elapsed time and load resumes without catch-up. The headless browser proof exercises Start/Pause directly rather than claiming a native tab-switch test.

Reproduce with Vite at `http://127.0.0.1:5180` and `node scripts/qa/check-gameplay-lab.mjs [Playwright module directory]`. Raw request/error evidence and screenshots are saved under `artifacts/qa/gameplay-lab/`.

Farmyard follow-up: browser proof asserts that no Farmyard build button exists, assigns a farmer in the built home, assigns one cow individually, then changes the last farmer to woodworker and verifies the cow’s assignment/available Farmyards are cleared. Core tests additionally cover tents, pre-existing farmer housing, multiple farmers, soft capacity, collapse and old-save migration without compensation.

Materials follow-up: core commands verify that only woodworker produces Materials with default balance; textileWorker, smith, boatbuilder and leatherAndJewelleryMaker remain inactive. The browser regression first reproduced detached controls, then passed with the in-place view update. Ten browser checks now pass.
