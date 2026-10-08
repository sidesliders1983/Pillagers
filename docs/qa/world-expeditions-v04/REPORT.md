# World Expeditions v0.4 QA

Date: 2026-10-08. Scope: issue #54, Simulation Core, player-visible world projection and /play.

## Result

PASS: full existing/new suite (133 tests at the full-suite checkpoint), then all 13 focused expedition tests including final eligibility coverage. TypeScript and production build pass. The existing Vite chunk-size advisory remains.

The first graph/group/cargo/casualty/transfer/save-validation tests failed before implementation. The first browser World-menu check failed before UI wiring. No mission outcome, RNG, target inventory or transfer is mocked.

Public tests verify four persistent hidden neighbours, reserved groups/ships, carried provisions, no home work/consumption while away, casualties, one category per survivor, resource conservation, exact people/cattle identities, genealogy after repeated raids, optional Surveyed knowledge, old-save domestic replay, malformed-save rejection and deterministic split/save replay.

## Browser results

[Browser report](browser-report.json) covers 13 successful checks: group creation and editing, four arrows, Unknown Pillage blocked, carried Food and real member absence, mid-mission save/load, Recon permitting Pillage, actual resource loot, optional Surveillance, historical reports, coast without a ship, iPad controls, Settings utilities/restart and shared Gameplay Lab saves. Browser runtime errors: none.

Controlled browser fixture: seed 32, 100% mission success, zero mission/natural casualties, weather disabled and 400 initial Food, all passed through the public campaign API. This isolates UI behavior; the production defaults remain 80/90/60% success and 2/3/10% member death risk with weather enabled.

Existing settlement browser regression: all 13 checks pass, including building/house salvage, livestock assignment, calving, weather, route-shared saves and narrow screens. Scroll regression passes for desktop viewport, sidebar scrolling, wheel zoom and mobile layout. Clock regression passes for automatic rollover and +1 Winter on both /play and /gameplay-lab.

Screenshots: [desktop](desktop.png), [iPad menu](ipad.png), [iPad board](ipad-board.png). World is a dismissible overlay; utility actions are in Settings. There are no animated traveling units, tactical combat, colonization or CPU attacks. Prototype balancing and large multi-clan performance calibration remain future work.
