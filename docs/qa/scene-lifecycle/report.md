# Active scene lifecycle — #209

Status: technical validation complete; normal owner review and physical iOS acceptance remain open. Required current-head CI is recorded on the draft PR. No automatic merge.

## Source and scope

Baseline main: ac3833d4fc286bce5c8522920420a006607a6e0f. No overlapping PRs were open at the final main check. Mechanical extraction: 48b4391. Lifecycle fixes: ede0d9c. Raw capture JSON records source hashes, dirty-diff fingerprint, exact fixture/asset hashes, Edge version, camera, Core and world projections. Later QA/documentation commits do not change runtime code.

One concrete createFjordScene owner now constructs, replaces, updates and releases the active Three.js presentation. FjordPlay retains campaign restoration, commands, UI, clock intent, page/context recovery and frame-loop installation. The [ownership map](../../gameplay/GAMEPLAY-FIRST-ARCHITECTURE.md#active-presentation-ownership-209) updates the existing #17 architecture location. No shader, scheduling, quality, gameplay, source asset, dependency or save-format changes. #210 and #211 remain separate.

## Exact parity

Desktop 1400×900 Standard: the existing paid village-17 Summer and winter-32 fixtures have identical Core/RNG/history/discovery, blueprint, camera, native wardrobe/actor projection, season/lighting, render resources and fixed-time RGBA pixels before/after. Desktop all-pass draw counts remain 235 and 246; geometry/texture counts remain 111/71 and 119/75. Mobile viewport 390×844 Low: the village fixture has identical state and pixels, 223 calls and 111/71 resources. The separate live interaction checks use Low effects; reproducible golden images freeze presentation time with effects Off. This does not assert pixel identity across physical devices.

The first extracted capture exposed a real HUD difference caused by CSS side-effect import order. The original order was restored in the mechanical commit and the final comparison passes without ignoring the UI or loosening its pixel assertion. Source hashes are checked again after each capture to reject edits during measurement.

## Lifecycle and actual gameplay controls

- Dispose twice during a real delayed asset request: late completion attaches no roots or UI, leaves no pending work and preserves exact Core
- Disposal during a real native body load drains without stale scene writes, exceptions, pending work or Core changes
- Three world replacements retain native resident instances and stabilize owned roots, GPU geometry/texture counters and one map; final disposal removes control bindings
- Replacing campaign 17 with 32 during a delayed native load publishes only current-campaign presentation, with exact Core and no stale completion
- An already-captured frame callback after disposal neither throws nor renders. Three world replacements stabilize at 12 roots, 111 geometries, 71 textures, one map and zero pending work; native resident object identity is retained. Final disposal leaves zero roots and removes owned control bindings.
- DPR 2 import replaces terrain 7 with terrain 18 and exact canonical state, with one map/control instance
- Restart rebinds the founding map and removes old expedition flags without duplicate controls
- Navigating away during generation terminates the worker without saving a partial campaign.
- Failed ground-material fetch retains the existing declared native-material fallback and reaches the playable Summer state.
- Touch on discovered rival opens Recon; confirmation spends exactly once, keeps Surveillance private and disables year skipping
- Map toggle and ordinary paid tent-to-house action retain exact Core command/event/charge semantics and render the house
- Running refresh preserves actual focused search edit and exact physical-mission tick replay
- Existing 390px resume runner: persisted pagehide/pageshow simulation keeps the warm scene paused with exact Core; real WEBGL_lose_context/restore preserves the campaign; genuine page reload restores the checkpoint exactly. BFCache event dispatch is synthetic, not evidence of physical Safari eviction behavior.
- Existing damaged-save recovery runner passed: damaged active save is exportable, failed worker restoration can retry from the exact valid checkpoint. No restored time is advanced during loading.

## Defects isolated from extraction

The public-owner tests went red for an attached target root after disposal, a late native model reading a disposed layer, a superseded campaign publishing old campfire coordinates, and a frame callback touching disposed motion. Fixes use the existing presentation epoch, stop/abort owned bindings, reject obsolete reconciliation, and defer shared model/template disposal until already-owned asynchronous work drains. They do not add a global resource cache or alter steady-state update cadence. Late model instances are released through their existing model owner. The optional FjordEntities current-revision guard retains the old default for other consumers.

## Representative host observations

Windows Edge 155.0.4283.62, Intel HD Graphics 630 via ANGLE/D3D11, DPR 1, 1400×900 Standard, paused canonical clock, animated presentation, 10-second samples from the existing opt-in audit. Other local QA browsers/build activity overlapped parts of these samples; the observations describe this host and are not controlled performance comparisons. JS heap is the whole-page instantaneous used heap, not an allocation-rate or leak measurement. There is no FPS improvement claim or timing acceptance threshold. Stable repeated resource counters and retained objects are the bounded lifetime evidence.

| Campaign | Frame interval median ms before / after | CPU callback median ms before / after | GPU query median ms before / after | Used JS heap MiB before / after |
| --- | --- | --- | --- | --- |
| village-17-island-pool-v2 | 71.4 / 72.1 | 14.2 / 13.5 | 65.9 / 71.4 | 440.7 / 437.8 |
| winter-32-island-pool-v2 | 71.0 / 54.0 | 11.0 / 10.0 | 64.3 / 57.1 | 462.1 / 428.3 |

All profile windows preserve exact Core. Raw frame distributions, CPU spans, GPU availability, heap totals and renderer counters are in before.json and after.json. Device acceptance under #151 remains separate.

## Validation and reproduction

- Production build, tsc, tracked public validation (465 files, 47 decoded terrain models) and explicit character/Lab-preview validation (20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules) passed. Existing Vite large-chunk warning remains unchanged.
- Related Node run: 80 passed, zero failed/skipped; see related-tests.txt. Full repository test/asset checks use the unmodified current-head GitHub workflow.
- Manual source/diff and whitespace review; no project formatter is configured. New owner formatting uses the installed TypeScript formatter.
- Serve the normal checkout with Vite on 5182, then run check-scene-owner.mjs and check-scene-interactions.mjs. Set QA_ORIGIN and QA_OUTPUT for check-island-map-lifecycle.mjs, check-cinematic-lifecycle.mjs, check-campaign-resume.mjs and check-campaign-recovery.mjs; never overwrite historical QA reports.
- For golden pairs, use fjord-runtime-server.mjs with QA_GOLDEN=1 on separate ports/cache directories. Pin the baseline with QA_SOURCE_REF=ac3833d4fc286bce5c8522920420a006607a6e0f and QA_PIN_SCENE_LIFECYCLE=1. capture-golden-fjord.mjs uses QA_FIXTURE_DIR=docs/qa/village-nature-203, QA_FIXTURES=village-17-island-pool-v2,winter-32-island-pool-v2, QA_RELOADS=1 and optional QA_PROFILE_MS=10000. Set QA_WIDTH=390, QA_HEIGHT=844, QA_QUALITY=low and the village fixture for mobile. Run compare-scene-lifecycle.mjs for each pair, then this publisher.

## Owner review and revert

Open review.html for matched captures. Physical iPhone/iPad remains pending: new/import/reload, background return, selection, drag/pinch, paid house actions, map/mission controls and retained field edits should feel unchanged. Browser touch emulation is not physical-device acceptance.

Revert the lifecycle-fix commit and mechanical extraction together (plus the QA/documentation commit if desired), then rerun the unchanged checks. There are no canonical/save migrations, asset conversions or new dependencies to undo.
